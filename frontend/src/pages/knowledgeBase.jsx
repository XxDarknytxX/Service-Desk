/**
 * Knowledge Base Page
 * Linear/Modern Design System
 */

import { useState, useEffect } from "react";
import { kbApi } from "../services/api";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Icon from "../components/ui/Icon";
import Input from "../components/ui/Input";
import Card from "../components/ui/Card";

const articleTints = ["blue", "indigo", "violet", "purple", "cyan", "teal", "emerald", "pink"];

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function KnowledgeBase() {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { loadData(); }, [selectedCategory]);

  async function loadData() {
    try {
      setLoading(true);
      const [articlesData, categoriesData] = await Promise.all([
        kbApi.getArticles(selectedCategory ? { category_id: selectedCategory, status: "published" } : { status: "published" }),
        kbApi.getCategories(),
      ]);
      setArticles(articlesData);
      setCategories(categoriesData);
    } catch (error) { console.error("Failed to load KB", error); }
    finally { setLoading(false); }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) { loadData(); return; }
    try {
      const results = await kbApi.searchArticles(searchQuery);
      setArticles(results);
    } catch (error) { console.error("Search failed", error); }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-[var(--shadow-card)] px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--fg-primary)] tracking-tight">Knowledge Base</h1>
            <p className="text-sm text-[var(--fg-secondary)] mt-1">Find answers and documentation</p>
          </div>
          <Button icon={<Icon name="plus" size={16} />}>Create Article</Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
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
              <p className="text-sm text-[var(--fg-secondary)]">Try adjusting your search or category filter</p>
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
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-[var(--fg-primary)]">
                      {article.title}
                    </h3>
                    {article.category_name && (
                      <Badge tone="brand">{article.category_name}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-[var(--fg-secondary)] line-clamp-2 mb-4 leading-relaxed">
                    {article.body?.substring(0, 200)}...
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
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
