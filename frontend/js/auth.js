"use strict";

let authMode = "login";

function setMode(mode) {
  authMode = mode;
  $("#tab-login").classList.toggle("active", mode === "login");
  $("#tab-signup").classList.toggle("active", mode === "signup");
  $("#f-name-row").style.display = mode === "signup" ? "flex" : "none";
  $("#f-confirm-row").style.display = mode === "signup" ? "flex" : "none";
  $("#btn-auth").textContent = mode === "signup" ? "Create account" : "Sign in";
}

function localUsers() {
  try { return JSON.parse(localStorage.getItem("carbonyx_users") || "[]"); }
  catch { return []; }
}

function randomWallet() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function localSignup(name, email, password) {
  const users = localUsers();
  if (users.find((u) => u.email === email.toLowerCase())) {
    throw new Error("An account with this email already exists");
  }
  const user = {
    id: users.length + 1,
    name, email: email.toLowerCase(),
    wallet_address: randomWallet(),
    role: "trader",
    offline: true,
  };
  users.push({ ...user, password });
  localStorage.setItem("carbonyx_users", JSON.stringify(users));
  const token = "local_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem("carbonyx_token", token);
  localStorage.setItem("carbonyx_local_user", JSON.stringify(user));
  return { token, user };
}

function localLogin(email, password) {
  const users = localUsers();
  const u = users.find((x) => x.email === email.toLowerCase() && x.password === password);
  if (!u) throw new Error("Invalid email or password");
  const user = { id: u.id, name: u.name, email: u.email, wallet_address: u.wallet_address, role: u.role, offline: true };
  const token = "local_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem("carbonyx_token", token);
  localStorage.setItem("carbonyx_local_user", JSON.stringify(user));
  return { token, user };
}

function isNetworkError(e) {

  return e instanceof TypeError ||
    /failed to fetch|network|load failed/i.test(String(e && e.message));
}

async function doAuth() {
  const email = $("#f-email").value.trim();
  const password = $("#f-password").value;
  const name = $("#f-name")?.value.trim() || "";
  const confirm = $("#f-confirm")?.value || "";

  if (!email || !password) return toast("Email and password are required.", true);
  if (authMode === "signup") {
    if (name.length < 2) return toast("Please enter your full name.", true);
    if (password.length < 6) return toast("Password must be at least 6 characters.", true);
    if (password !== confirm) return toast("Passwords do not match.", true);
  }

  const btn = $("#btn-auth");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ' + (authMode === "signup" ? "Creating..." : "Signing in...");

  try {

    const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const body = authMode === "signup"
      ? { name, email, password }
      : { email, password };
    const res = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
    localStorage.setItem("carbonyx_token", res.token);
    localStorage.removeItem("carbonyx_local_user");
    state.user = res.user;
    finishAuth(res.user);
  } catch (e) {

    if (isNetworkError(e)) {
      try {
        const res = authMode === "signup"
          ? localSignup(name, email, password)
          : localLogin(email, password);
        state.user = res.user;
        toast("Backend offline - signed in with local demo account.");
        setTimeout(() => { finishAuth(res.user); }, 700);
        return;
      } catch (localErr) {
        toast(localErr.message, true);
      }
    } else {

      toast(e.message, true);
    }
    btn.disabled = false;
    btn.textContent = authMode === "signup" ? "Create account" : "Sign in";
  }
}

function finishAuth(user) {
  toast(`Welcome, ${user.name.split(" ")[0]}! Your wallet is ${short(user.wallet_address || "")}.`);
  setTimeout(() => { window.location.href = "dashboard.html"; }, 900);
}

document.addEventListener("DOMContentLoaded", () => {
  $("#tab-login").addEventListener("click", () => setMode("login"));
  $("#tab-signup").addEventListener("click", () => setMode("signup"));
  $("#btn-auth").addEventListener("click", doAuth);
  $("#auth-form").addEventListener("submit", (e) => { e.preventDefault(); doAuth(); });

  const token = localStorage.getItem("carbonyx_token");
  if (token) {
    if (token.startsWith("local_")) {
      if (localStorage.getItem("carbonyx_local_user")) window.location.href = "dashboard.html";
    } else {
      api("/api/auth/me").then(() => { window.location.href = "dashboard.html"; }).catch(() => {});
    }
  }
});
