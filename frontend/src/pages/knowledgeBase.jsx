/**
 * Knowledge Base Page
 * Linear/Modern Design System
 * Browse, search, read, and (for agents/admins) author articles.
 */

import { useState, useEffect } from "react";
import { kbApi } from "../services/api";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Input, { Textarea, Select } from "../components/ui/Input";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import useConfirm from "../components/ui/useConfirm";
import { useAuth } from "../contexts/auth";
import { useToast } from "../contexts/toast";

const articleTints = ["blue", "indigo", "violet", "purple", "cyan", "teal", "emerald", "pink"];

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">Knowledge Base</h1>
            <p className="text-sm text-[var(--fg-secondary)] mt-1">Find answers and documentation</p>
          </div>
          {canAuthor && (
            <Button onClick={openCreate} icon={<Icon name="plus" size={16} />}>Create Article</Button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <Card tint="slate" hover={false} size="sm">
            <h3 className="text-[11px] font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-3 px-3">Categories</h3>
            <div className="space-y-1">
              <button onClick={() => setSelectedCategory(null)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  selectedCategory === null
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "text-[var(--fg-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--fg-primary)]"
                )}>
                <div className="flex items-center justify-between">
                  <span>All Articles</span>
                  {selectedCategory === null && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></div>
                  )}
                </div>
              </button>
              {categories.map((cat) => (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    selectedCategory === cat.id
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "text-[var(--fg-secondary)] hover:bg-[var(--bg-base)] hover:text-[var(--fg-primary)]"
                  )}>
                  <div className="flex items-center justify-between">
                    <span>{cat.name}</span>
                    {selectedCategory === cat.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4">
          {/* Search */}
          <Card tint="blue" hover={false} size="sm">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  icon="search"
                  placeholder="Search articles by title, content, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} variant="primary">Search</Button>
            </div>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[var(--border-default)] border-t-[var(--accent)] mb-3"></div>
                <p className="text-sm text-[var(--fg-secondary)]">Loading articles...</p>
              </div>
            </div>
          ) : articles.length === 0 ? (
            <div className={cn(
              "text-center py-20 rounded-xl",
              "bg-[var(--bg-elevated)]",
              "border border-[var(--border-default)]",
              "shadow-[var(--shadow-card)]"
            )}>
              <div className={cn(
                "inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4",
                "bg-[var(--bg-base)] border border-[var(--border-default)]"
              )}>
                <Icon name="knowledgeBase" size={32} className="text-[var(--fg-muted)]" />
              </div>
              <p className="text-sm font-semibold text-[var(--fg-primary)] mb-1">No articles found</p>
              <p className="text-sm text-[var(--fg-secondary)] mb-5">
                {searchQuery ? "Try adjusting your search or category filter" : "This knowledge base is empty so far"}
              </p>
              {canAuthor && !searchQuery && (
                <Button onClick={openCreate} icon={<Icon name="plus" size={16} />}>
                  Write the first article
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {articles.map((article, idx) => (
                <Card
                  key={article.id}
                  tint={articleTints[idx % articleTints.length]}
                  spotlight
                  hover
                  className="cursor-pointer group"
                  onClick={() => setViewArticle(article)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-[var(--fg-primary)] group-hover:text-[var(--accent)] transition-colors">
                      {article.title}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {article.status === "draft" && (
                        <Badge tone="amber" size="sm">Draft</Badge>
                      )}
                      {article.category_name && (
                        <Badge tone="brand">{article.category_name}</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--fg-secondary)] line-clamp-2 mb-4 leading-relaxed">
                    {(article.body || "").substring(0, 200)}{(article.body || "").length > 200 ? "…" : ""}
                  </p>
                  <div className="flex items-center gap-4 pt-3 border-t border-[var(--border-default)]">
                    <div className="flex items-center gap-1.5">
                      <Icon name="user" size={12} className="text-[var(--fg-muted)]" />
                      <span className="text-[11px] text-[var(--fg-muted)]">{article.author_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon name="calendar" size={12} className="text-[var(--fg-muted)]" />
                      <span className="text-[11px] text-[var(--fg-muted)]">
                        {new Date(article.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="ml-auto text-[11px] text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      Read article <Icon name="arrowRight" size={11} />
                    </span>
                  </div>
                </Card>
              ))}
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
          `${viewArticle.author_name || "Unknown author"} · Updated ${new Date(viewArticle.updated_at).toLocaleDateString()}`
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
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {viewArticle.status === "draft" && <Badge tone="amber" size="sm">Draft</Badge>}
              {viewArticle.category_name && <Badge tone="brand">{viewArticle.category_name}</Badge>}
            </div>
            <div className="text-sm text-[var(--fg-secondary)] leading-relaxed whitespace-pre-wrap">
              {viewArticle.body}
            </div>
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
        <div className="space-y-5">
          <Input
            label="Title"
            placeholder="How to reset your password"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
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
          <Textarea
            label="Content"
            placeholder="Write the article content here…"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={12}
          />
        </div>
      </Modal>

      {confirmDialog}
    </div>
  );
}
