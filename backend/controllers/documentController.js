const mongoose = require("mongoose");
const Document = require("../models/Document");
const User = require("../models/User");
const {
  EDITOR_ROLE,
  VIEWER_ROLE,
  getUserDocumentRole,
  canRead,
} = require("../utils/permissions");

const sanitizeTitle = (title) =>
  String(title || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 200);

const sanitizeEmail = (email) => String(email || "").trim().toLowerCase();

const mapDocumentSummary = (doc, role) => ({
  id: doc._id.toString(),
  title: doc.title,
  updatedAt: doc.updatedAt,
  role,
});

const listDocuments = async (req, res) => {
  try {
    const userId = req.user.id;

    const documents = await Document.find(
      {
        $or: [{ owner: userId }, { "collaborators.user": userId }],
      },
      {
        title: 1,
        updatedAt: 1,
        owner: 1,
        collaborators: 1,
      }
    )
      .sort({ updatedAt: -1 })
      .lean();

    const payload = documents
      .map((doc) => {
        const role = getUserDocumentRole(doc, userId);
        if (!canRead(role)) {
          return null;
        }
        return mapDocumentSummary(doc, role);
      })
      .filter(Boolean);

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Failed to list documents:", error.message);
    return res.status(500).json({ message: "Failed to list documents." });
  }
};

const createDocument = async (req, res) => {
  try {
    const title = sanitizeTitle(req.body?.title);

    if (!title) {
      return res.status(400).json({ message: "Title is required." });
    }

    const created = await Document.create({
      owner: req.user.id,
      title,
      content: Buffer.alloc(0),
      updatedAt: new Date(),
    });

    return res.status(201).json({
      id: created._id.toString(),
      title: created.title,
      updatedAt: created.updatedAt,
      role: "owner",
    });
  } catch (error) {
    console.error("Failed to create document:", error.message);
    return res.status(500).json({ message: "Failed to create document." });
  }
};

const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id." });
    }

    const document = await Document.findById(id, {
      title: 1,
      updatedAt: 1,
      owner: 1,
      collaborators: 1,
    }).lean();

    if (!document) {
      return res.status(404).json({ message: "Document not found." });
    }

    const role = getUserDocumentRole(document, req.user.id);
    if (!canRead(role)) {
      return res.status(403).json({ message: "Not allowed to access this document." });
    }

    return res.status(200).json({
      id: document._id.toString(),
      title: document.title,
      updatedAt: document.updatedAt,
      role,
    });
  } catch (error) {
    console.error("Failed to fetch document:", error.message);
    return res.status(500).json({ message: "Failed to fetch document." });
  }
};

const shareDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const email = sanitizeEmail(req.body?.email);
    const role = String(req.body?.role || "").trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id." });
    }

    if (![EDITOR_ROLE, VIEWER_ROLE].includes(role)) {
      return res.status(400).json({ message: "Role must be editor or viewer." });
    }

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ message: "Document not found." });
    }

    if (document.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only owner can change collaborators." });
    }

    const user = await User.findOne({ email }).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: "Owner already has full access." });
    }

    const existingIndex = document.collaborators.findIndex(
      (entry) => entry.user.toString() === user._id.toString()
    );

    if (existingIndex >= 0) {
      document.collaborators[existingIndex].role = role;
    } else {
      document.collaborators.push({ user: user._id, role });
    }

    await document.save();

    return res.status(200).json({
      message: "Collaborator updated.",
      collaborator: {
        id: user._id.toString(),
        email: user.email,
        role,
      },
    });
  } catch (error) {
    console.error("Failed to share document:", error.message);
    return res.status(500).json({ message: "Failed to share document." });
  }
};

const getDocumentSnapshot = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid document id." });
    }

    const document = await Document.findById(id, {
      content: 1,
      updatedAt: 1,
      owner: 1,
      collaborators: 1,
    }).lean();

    if (!document) {
      return res.status(404).json({ message: "Document not found." });
    }

    const role = getUserDocumentRole(document, req.user.id);
    if (!canRead(role)) {
      return res.status(403).json({ message: "Not allowed to access this document." });
    }

    return res.status(200).json({
      id,
      updatedAt: document.updatedAt,
      contentBase64: Buffer.from(document.content || Buffer.alloc(0)).toString("base64"),
    });
  } catch (error) {
    console.error("Failed to fetch snapshot:", error.message);
    return res.status(500).json({ message: "Failed to fetch snapshot." });
  }
};

module.exports = {
  listDocuments,
  createDocument,
  getDocumentById,
  shareDocument,
  getDocumentSnapshot,
};
