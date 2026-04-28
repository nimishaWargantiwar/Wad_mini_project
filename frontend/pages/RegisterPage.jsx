import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../services/api";
import { useAuth } from "../context/AuthContext";

const RegisterPage = () => {
  const navigate = useNavigate();
  const { saveSession } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await registerUser({ name, email, password });
      saveSession(result);
      navigate("/documents", { replace: true });
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to register.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <section className="w-full rounded-2xl bg-white/80 p-8 shadow-xl backdrop-blur">
        <h1 className="font-heading text-3xl text-slate-900">Create Account</h1>
        <p className="mt-2 text-sm text-slate-600">Start collaborating in real time.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
              required
              minLength={2}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
              required
              minLength={8}
            />
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Already registered?{" "}
          <Link className="font-medium text-sky-700" to="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
};

export default RegisterPage;
