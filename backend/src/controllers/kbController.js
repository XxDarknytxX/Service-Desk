// src/controllers/kbController.js
export function makeKbController(pool) {
  return {
    // Categories
    async getCategories(req, res) {
      try {
        const [rows] = await pool.query(
          `SELECT id, name, description, created_at, updated_at
           FROM kb_categories
           ORDER BY name`
        );
        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch categories" });
      }
    },

    async createCategory(req, res) {
      try {
        const { name, description } = req.body;
        const [result] = await pool.query(
          `INSERT INTO kb_categories (name, description) VALUES (?, ?)`,
          [name, description]
        );
        res.status(201).json({ id: result.insertId, name, description });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create category" });
      }
    },

    async updateCategory(req, res) {
      try {
        const { id } = req.params;
        const { name, description } = req.body;
        await pool.query(
          `UPDATE kb_categories SET name = ?, description = ? WHERE id = ?`,
          [name, description, id]
        );
        res.json({ id: Number(id), name, description });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update category" });
      }
    },

    async deleteCategory(req, res) {
      try {
        const { id } = req.params;
        await pool.query(`DELETE FROM kb_categories WHERE id = ?`, [id]);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete category" });
      }
    },

    // Articles
    async getArticles(req, res) {
      try {
        const { category_id, status } = req.query;
        let query = `
          SELECT a.id, a.category_id, a.title, a.body, a.status,
                 a.author_id, a.published_at, a.created_at, a.updated_at,
                 u.full_name as author_name,
                 c.name as category_name
          FROM kb_articles a
          LEFT JOIN users u ON a.author_id = u.id
          LEFT JOIN kb_categories c ON a.category_id = c.id
          WHERE 1=1
        `;
        const params = [];

        if (category_id) {
          query += ` AND a.category_id = ?`;
          params.push(category_id);
        }
        if (status) {
          query += ` AND a.status = ?`;
          params.push(status);
        }

        query += ` ORDER BY a.updated_at DESC`;

        const [rows] = await pool.query(query, params);
        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch articles" });
      }
    },

    async getArticle(req, res) {
      try {
        const { id } = req.params;
        const [rows] = await pool.query(
          `SELECT a.*, u.full_name as author_name, c.name as category_name
           FROM kb_articles a
           LEFT JOIN users u ON a.author_id = u.id
           LEFT JOIN kb_categories c ON a.category_id = c.id
           WHERE a.id = ?`,
          [id]
        );
        if (rows.length === 0) {
          return res.status(404).json({ error: "Article not found" });
        }
        res.json(rows[0]);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch article" });
      }
    },

    async createArticle(req, res) {
      try {
        const { category_id, title, body, status } = req.body;
        const author_id = req.user.id;
        const published_at = status === "published" ? new Date() : null;

        const [result] = await pool.query(
          `INSERT INTO kb_articles (category_id, title, body, status, author_id, published_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [category_id, title, body, status || "draft", author_id, published_at]
        );

        res.status(201).json({ id: result.insertId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create article" });
      }
    },

    async updateArticle(req, res) {
      try {
        const { id } = req.params;
        const { category_id, title, body, status } = req.body;

        const [current] = await pool.query(
          `SELECT status FROM kb_articles WHERE id = ?`,
          [id]
        );

        let published_at = null;
        if (status === "published" && current[0]?.status !== "published") {
          published_at = new Date();
        }

        const query = published_at
          ? `UPDATE kb_articles SET category_id = ?, title = ?, body = ?, status = ?, published_at = ? WHERE id = ?`
          : `UPDATE kb_articles SET category_id = ?, title = ?, body = ?, status = ? WHERE id = ?`;

        const params = published_at
          ? [category_id, title, body, status, published_at, id]
          : [category_id, title, body, status, id];

        await pool.query(query, params);
        res.json({ id: Number(id) });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update article" });
      }
    },

    async deleteArticle(req, res) {
      try {
        const { id } = req.params;
        await pool.query(`DELETE FROM kb_articles WHERE id = ?`, [id]);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete article" });
      }
    },

    async searchArticles(req, res) {
      try {
        const { q } = req.query;
        const searchTerm = `%${q}%`;

        const [rows] = await pool.query(
          `SELECT a.id, a.title, a.category_id, c.name as category_name
           FROM kb_articles a
           LEFT JOIN kb_categories c ON a.category_id = c.id
           WHERE a.status = 'published'
             AND (a.title LIKE ? OR a.body LIKE ?)
           ORDER BY a.title
           LIMIT 20`,
          [searchTerm, searchTerm]
        );

        res.json(rows);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to search articles" });
      }
    },
  };
}
