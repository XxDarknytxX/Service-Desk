/**
 * Knowledge Base Page — Vodafone Service Desk
 *
 * Premium self-service experience: a branded header, a prominent hero search,
 * a clean categories sidebar, and articles as elevated, hover-lifting cards in
 * a responsive grid. A polished reader modal renders article bodies with
 * token-driven typography, and agents/admins keep the full authoring flow.
 *
 * All state, effects, handlers, API calls (kbApi), role gating, search, and the
 * read/create/edit/delete features are preserved exactly — this is visual only.
 */

import { useState, useEffect } from "react";
import { kbApi } from "../services/api";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import { Textarea, Select } from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";

const articleTints = ["blue", "indigo", "violet", "purple", "cyan", "teal", "emerald", "pink"];

// Top-accent bar colors per tint (static classes — no dynamic Tailwind).
const TINT_BAR = {
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  emerald: "bg-emerald-500",
  pink: "bg-pink-500",
};

// Soft icon-tile classes per tint (static classes — no dynamic Tailwind).
const TINT_TILE = {
  blue: "bg-blue-500/10 text-blue-500",
  indigo: "bg-indigo-500/10 text-indigo-500",
  violet: "bg-violet-500/10 text-violet-500",
  purple: "bg-purple-500/10 text-purple-500",
  cyan: "bg-cyan-500/10 text-cyan-500",
  teal: "bg-teal-500/10 text-teal-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
  pink: "bg-pink-500/10 text-pink-500",
};

const EMPTY_ARTICLE = { title: "", category_id: "", body: "", status: "published" };

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function KnowledgeBase() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Read / author modals
  const [viewArticle, setViewArticle] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_ARTICLE });
  const [saving, setSaving] = useState(false);

  const canAuthor = user?.roles?.includes("admin") || user?.roles?.includes("agent");

  useEffect(() => { loadData(); }, [selectedCategory]);

  async function loadData() {
    try {
      setLoading(true);
      const params = {};
      if (selectedCategory) params.category_id = selectedCategory;
      // Requesters only see published articles; agents/admins see drafts too
      if (!canAuthor) params.status = "published";
      const [articlesData, categoriesData] = await Promise.all([
        kbApi.getArticles(params),
        kbApi.getCategories(),
      ]);
      setArticles(articlesData);
      setCategories(categoriesData);
    } catch (error) {
      console.error("Failed to load KB", error);
      toast.error(error.message || "Failed to load knowledge base");
    }
    finally { setLoading(false); }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) { loadData(); return; }
    try {
      setLoading(true);
      const results = await kbApi.searchArticles(searchQuery);
      setArticles(results);
    } catch (error) {
      console.error("Search failed", error);
      toast.error(error.message || "Search failed");
    }
    finally { setLoading(false); }
  }

  function openCreate() {
    setEditingArticle(null);
    setForm({ ...EMPTY_ARTICLE, category_id: selectedCategory || "" });
    setShowEditor(true);
  }

  function openEdit(article) {
    setEditingArticle(article);
    setForm({
      title: article.title || "",
      category_id: article.category_id || "",
      body: article.body || "",
      status: article.status || "published",
    });
    setViewArticle(null);
    setShowEditor(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.body.trim()) { toast.error("Article content is required"); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category_id: form.category_id ? Number(form.category_id) : null,
        body: form.body,
        status: form.status,
      };
      if (editingArticle) {
        await kbApi.updateArticle(editingArticle.id, payload);
        toast.success("Article updated");
      } else {
        await kbApi.createArticle(payload);
        toast.success("Article created");
      }
      setShowEditor(false);
      loadData();
    } catch (error) {
      toast.error(error.message || "Failed to save article");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(article) {
    confirm({
      title: "Delete article?",
      message: (
        <>
          This will permanently delete{" "}
          <strong className="text-[var(--fg-primary)]">{article.title}</strong>{" "}
          from the knowledge base.
        </>
      ),
      confirmText: "Delete Article",
      onConfirm: async () => {
        try {
          await kbApi.deleteArticle(article.id);
          toast.success("Article deleted");
          setViewArticle(null);
          loadData();
        } catch (error) {
          toast.error(error.message || "Failed to delete article");
        }
      },
    });
  }

  // ── Derived UI helpers (no data contract changes) ──────────────
  const formatDate = (value) =>
    new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const totalArticles = articles.length;
  const draftCount = articles.filter((a) => a.status === "draft").length;
  const activeCategoryName =
    selectedCategory == null
      ? null
      : categories.find((c) => c.id === selectedCategory)?.name || null;

  const subtitle = loading
    ? "Find answers and documentation"
    : searchQuery.trim()
    ? `${totalArticles} ${totalArticles === 1 ? "result" : "results"} for “${searchQuery.trim()}”`
    : activeCategoryName
    ? `${totalArticles} ${totalArticles === 1 ? "article" : "articles"} in ${activeCategoryName}`
    : `${totalArticles} ${totalArticles === 1 ? "article" : "articles"} across the knowledge base`;

  // Reusable bordered icon-button (mirrors tickets.jsx ControlButton)
  const ControlButton = ({ active, title, onClick, children }) => (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-10 w-10 inline-flex items-center justify-center rounded-lg transition-all duration-150",
        "bg-[var(--bg-elevated)] border",
        active
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--border-default)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface)] hover:border-[var(--border-hover)]"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        icon="knowledgeBase"
        title="Knowledge Base"
        subtitle={subtitle}
        actions={
          <>
            <ControlButton title="Refresh" onClick={() => loadData()}>
              <Icon name="refresh" size={16} className={cn(loading && "animate-spin")} />
            </ControlButton>
            {canAuthor && (
              <Button onClick={openCreate} icon={<Icon name="plus" size={16} />}>
                Create Article
              </Button>
            )}
          </>
        }
      />

      {/* Hero search */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] animate-fade-up">
        <div className="pointer-events-none absolute -top-20 -right-12 h-52 w-52 rounded-full bg-[var(--accent)] opacity-[0.10] blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-40" />

        <div className="relative p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[var(--fg-muted)] text-xs font-medium mb-3">
            <Icon name="search" size={13} />
            How can we help you today?
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Icon
                name="search"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--fg-muted)] pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search articles by title, content, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className={cn(
                  "w-full pl-11 pr-4 h-12 rounded-xl text-sm",
                  "bg-[var(--bg-base)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                  "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
                  "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
                  "transition-all duration-200"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); loadData(); }}
                  title="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                >
                  <Icon name="x" size={15} />
                </button>
              )}
            </div>
            <Button onClick={handleSearch} variant="primary" size="lg" icon={<Icon name="search" size={16} />}>
              Search
            </Button>
          </div>
        </div>
      </div>

      {/* Layout: categories sidebar + articles */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Categories sidebar */}
        <aside className="w-full lg:w-64 flex-shrink-0">
          <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] overflow-hidden animate-fade-up" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[var(--border-default)]">
              <span className="h-8 w-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                <Icon name="layers" size={16} />
              </span>
              <h2 className="text-[15px] font-semibold text-[var(--fg-primary)] tracking-tight">Categories</h2>
            </div>
            <nav className="p-2 space-y-1 lg:max-h-[calc(100vh-20rem)] lg:overflow-y-auto scrollbar-none">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  "group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                  selectedCategory === null
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
                )}
              >
                <span
                  className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    selectedCategory === null
                      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "bg-[var(--bg-surface)] text-[var(--fg-muted)] group-hover:text-[var(--fg-secondary)]"
                  )}
                >
                  <Icon name="grid" size={14} />
                </span>
                <span className="flex-1 text-left truncate">All Articles</span>
                {selectedCategory === null && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />}
              </button>

              {categories.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                      active
                        ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
                    )}
                  >
                    <span
                      className={cn(
                        "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                        active
                          ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                          : "bg-[var(--bg-surface)] text-[var(--fg-muted)] group-hover:text-[var(--fg-secondary)]"
                      )}
                    >
                      <Icon name="folder" size={14} />
                    </span>
                    <span className="flex-1 text-left truncate">{cat.name}</span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Articles */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-7 w-7" rounded="rounded-lg" />
                    <Skeleton className="h-5 w-20" rounded="rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-4/5" rounded="rounded-md" />
                    <Skeleton className="h-3 w-full" rounded="rounded-md" />
                    <Skeleton className="h-3 w-11/12" rounded="rounded-md" />
                    <Skeleton className="h-3 w-2/3" rounded="rounded-md" />
                  </div>
                  <div className="pt-3 border-t border-[var(--border-default)] flex items-center gap-3">
                    <Skeleton className="h-3 w-20" rounded="rounded-md" />
                    <Skeleton className="h-3 w-16" rounded="rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]">
              <EmptyState
                icon="knowledgeBase"
                title={searchQuery ? "No articles found" : "This knowledge base is empty"}
                description={
                  searchQuery
                    ? "Try adjusting your search terms or switching the category filter."
                    : "There are no articles here yet. Knowledge will appear once it's published."
                }
                action={
                  canAuthor && !searchQuery ? (
                    <Button onClick={openCreate} icon={<Icon name="plus" size={16} />}>
                      Write the first article
                    </Button>
                  ) : searchQuery ? (
                    <Button
                      variant="secondary"
                      onClick={() => { setSearchQuery(""); loadData(); }}
                      icon={<Icon name="refresh" size={15} />}
                    >
                      Clear search
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {articles.map((article, idx) => {
                const tint = articleTints[idx % articleTints.length];
                const excerpt = (article.body || "").substring(0, 180);
                return (
                  <button
                    key={article.id}
                    onClick={() => setViewArticle(article)}
                    className={cn(
                      "group relative text-left flex flex-col overflow-hidden rounded-2xl p-5",
                      "bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)]",
                      "transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-card-hover)]",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]",
                      "animate-fade-up"
                    )}
                    style={{ animationDelay: `${Math.min(idx * 45, 360)}ms` }}
                  >
                    {/* top accent bar */}
                    <span className={cn("absolute inset-x-0 top-0 h-0.5 opacity-70", TINT_BAR[tint] || TINT_BAR.blue)} />

                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span
                        className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110",
                          TINT_TILE[tint] || TINT_TILE.blue
                        )}
                      >
                        <Icon name="fileText" size={16} />
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {article.status === "draft" && <Badge tone="amber" size="sm">Draft</Badge>}
                        {article.category_name && <Badge tone="brand" size="sm">{article.category_name}</Badge>}
                      </div>
                    </div>

                    <h3 className="text-[15px] font-semibold text-[var(--fg-primary)] leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                      {article.title}
                    </h3>

                    <p className="mt-2 text-[13px] text-[var(--fg-secondary)] leading-relaxed line-clamp-3 flex-1">
                      {excerpt}{(article.body || "").length > 180 ? "…" : ""}
                    </p>

                    <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center gap-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icon name="user" size={12} className="text-[var(--fg-muted)] shrink-0" />
                        <span className="text-[11px] text-[var(--fg-muted)] truncate">{article.author_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Icon name="calendar" size={12} className="text-[var(--fg-muted)]" />
                        <span className="text-[11px] text-[var(--fg-muted)]">{formatDate(article.updated_at)}</span>
                      </div>
                      <span className="ml-auto text-[11px] font-medium text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 shrink-0">
                        Read <Icon name="arrowRight" size={11} className="group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Article Reader Modal */}
      <Modal
        open={!!viewArticle}
        onClose={() => setViewArticle(null)}
        title={viewArticle?.title}
        subtitle={
          viewArticle &&
          `${viewArticle.author_name || "Unknown author"} · Updated ${formatDate(viewArticle.updated_at)}`
        }
        size="lg"
        actions={
          canAuthor ? (
            <>
              <Button
                variant="ghost"
                onClick={() => handleDelete(viewArticle)}
                className="mr-auto text-rose-400 hover:bg-rose-500/10"
                icon={<Icon name="trash" size={14} />}
              >
                Delete
              </Button>
              <Button variant="secondary" onClick={() => setViewArticle(null)}>Close</Button>
              <Button onClick={() => openEdit(viewArticle)} icon={<Icon name="pencil" size={14} />}>
                Edit Article
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setViewArticle(null)}>Close</Button>
          )
        }
      >
        {viewArticle && (
          <div className="space-y-5">
            {(viewArticle.status === "draft" || viewArticle.category_name) && (
              <div className="flex items-center gap-2 flex-wrap">
                {viewArticle.status === "draft" && <Badge tone="amber" size="sm">Draft</Badge>}
                {viewArticle.category_name && <Badge tone="brand" size="sm">{viewArticle.category_name}</Badge>}
              </div>
            )}

            {/* Meta strip */}
            <div className="flex items-center gap-4 text-xs text-[var(--fg-muted)] pb-4 border-b border-[var(--border-default)]">
              <span className="flex items-center gap-1.5">
                <Icon name="user" size={13} />
                {viewArticle.author_name || "Unknown author"}
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="calendar" size={13} />
                Updated {formatDate(viewArticle.updated_at)}
              </span>
            </div>

            {/* Article body — token-driven reader typography */}
            <article className="text-[15px] text-[var(--fg-secondary)] leading-[1.75] whitespace-pre-wrap [&_strong]:text-[var(--fg-primary)] [&_a]:text-[var(--accent)]">
              {viewArticle.body}
            </article>
          </div>
        )}
      </Modal>

      {/* Article Editor Modal */}
      <Modal
        open={showEditor}
        onClose={() => setShowEditor(false)}
        title={editingArticle ? "Edit Article" : "Create Article"}
        subtitle={editingArticle ? "Update this knowledge base article" : "Share knowledge with your team and customers"}
        size="lg"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowEditor(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              {editingArticle ? "Save Changes" : "Create Article"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Details */}
          <div className="space-y-4">
            <p className="text-label">Article details</p>
            <div>
              <label className="block text-sm font-medium text-[var(--fg-primary)] mb-2">
                Title <span className="text-[var(--accent)]">*</span>
              </label>
              <div className="relative">
                <Icon
                  name="fileText"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--fg-muted)] pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="How to reset your password"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className={cn(
                    "w-full pl-10 pr-4 py-2.5 rounded-lg text-sm min-h-[40px]",
                    "bg-[var(--bg-elevated)] text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)]",
                    "border border-[var(--border-default)] hover:border-[var(--border-hover)]",
                    "focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20",
                    "transition-all duration-200"
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Category"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </Select>
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                helperText={form.status === "draft" ? "Only agents and admins can see drafts" : "Visible to everyone"}
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </Select>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <p className="text-label">Content</p>
            <Textarea
              placeholder="Write the article content here…"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={12}
            />
          </div>
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}
