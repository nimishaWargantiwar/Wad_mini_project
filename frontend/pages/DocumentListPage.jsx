import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createDocument, fetchDocuments, shareDocument } from "../services/api";

const DocumentListPage = () => {
  const [documents, setDocuments] = useState([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareEmailByDoc, setShareEmailByDoc] = useState({});
  const [shareRoleByDoc, setShareRoleByDoc] = useState({});

  const loadDocuments = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchDocuments();
      setDocuments(response);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const onCreate = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }

    try {
      await createDocument(title.trim());
      setTitle("");
      await loadDocuments();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to create document.");
    }
  };

  const onShare = async (docId) => {
    const email = String(shareEmailByDoc[docId] || "").trim();
    const role = shareRoleByDoc[docId] || "viewer";
    if (!email) {
      return;
    }

    try {
      await shareDocument({ id: docId, email, role });
      setShareEmailByDoc((current) => ({ ...current, [docId]: "" }));
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to share document.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="font-heading text-3xl text-slate-900">Your Documents</h1>
      </header>

      <form className="mb-8 flex gap-3" onSubmit={onCreate}>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="New document title"
          className="w-full rounded-xl border border-slate-300 bg-white/80 px-4 py-2 outline-none focus:border-sky-500"
        />
        <button className="rounded-xl bg-slate-900 px-4 py-2 font-medium text-white" type="submit">
          Create
        </button>
      </form>

      {error ? <p className="mb-4 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="text-slate-600">Loading documents...</p> : null}

      <section className="grid gap-4 md:grid-cols-2">
        {documents.map((doc) => (
          <article key={doc.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg text-slate-900">{doc.title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{doc.role}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Updated: {new Date(doc.updatedAt).toLocaleString()}
            </p>
            <Link
              to={`/documents/${doc.id}`}
              className="mt-3 inline-block rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white"
            >
              Open Editor
            </Link>

            {doc.role === "owner" ? (
              <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Share Access</p>
                <input
                  type="email"
                  value={shareEmailByDoc[doc.id] || ""}
                  onChange={(event) =>
                    setShareEmailByDoc((current) => ({
                      ...current,
                      [doc.id]: event.target.value,
                    }))
                  }
                  placeholder="collaborator@email.com"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <select
                    value={shareRoleByDoc[doc.id] || "viewer"}
                    onChange={(event) =>
                      setShareRoleByDoc((current) => ({
                        ...current,
                        [doc.id]: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => onShare(doc.id)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white"
                  >
                    Invite
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
};

export default DocumentListPage;
