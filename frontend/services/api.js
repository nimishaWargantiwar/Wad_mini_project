import axios from "axios";

const TOKEN_KEY = "collab_token";

const resolveApiBaseUrl = () => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredBaseUrl && configuredBaseUrl.trim()) {
    return configuredBaseUrl.trim();
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost:5000";
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS || 10000),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const registerUser = async ({ name, email, password }) => {
  const response = await api.post("/auth/register", { name, email, password });
  return response.data;
};

export const loginUser = async ({ email, password }) => {
  const response = await api.post("/auth/login", { email, password });
  return response.data;
};

export const fetchCurrentUser = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

export const fetchDocuments = async () => {
  const response = await api.get("/documents");
  return response.data;
};

export const createDocument = async (title) => {
  const response = await api.post("/documents", { title });
  return response.data;
};

export const fetchDocument = async (id) => {
  const response = await api.get(`/documents/${id}`);
  return response.data;
};

export const shareDocument = async ({ id, email, role }) => {
  const response = await api.post(`/documents/${id}/share`, { email, role });
  return response.data;
};

export const fetchDocumentSnapshot = async (id) => {
  const response = await api.get(`/documents/${id}/snapshot`);
  return response.data;
};

export default api;
