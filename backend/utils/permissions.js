const OWNER_ROLE = "owner";
const EDITOR_ROLE = "editor";
const VIEWER_ROLE = "viewer";

const getUserDocumentRole = (document, userId) => {
  const ownerId = document.owner?.toString();
  if (ownerId === userId) {
    return OWNER_ROLE;
  }

  const collaborator = document.collaborators?.find(
    (entry) => entry.user?.toString() === userId
  );

  if (collaborator) {
    return collaborator.role;
  }

  return null;
};

const canRead = (role) =>
  role === OWNER_ROLE || role === EDITOR_ROLE || role === VIEWER_ROLE;

const canEdit = (role) => role === OWNER_ROLE || role === EDITOR_ROLE;

module.exports = {
  OWNER_ROLE,
  EDITOR_ROLE,
  VIEWER_ROLE,
  getUserDocumentRole,
  canRead,
  canEdit,
};
