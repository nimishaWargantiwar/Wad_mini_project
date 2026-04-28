const express = require("express");
const {
  listDocuments,
  createDocument,
  getDocumentById,
  shareDocument,
  getDocumentSnapshot,
} = require("../controllers/documentController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

router.get("/", listDocuments);
router.post("/", createDocument);
router.get("/:id", getDocumentById);
router.get("/:id/snapshot", getDocumentSnapshot);
router.post("/:id/share", shareDocument);

module.exports = router;
