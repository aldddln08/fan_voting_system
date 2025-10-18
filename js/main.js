// js/main.js

import { supabase } from "./supabaseClient.js";

// --- HTML Elements ---
const loadingEl = document.getElementById("loading");
const mainContentEl = document.getElementById("main-content");
const optionsContainer = document.getElementById("options-container");
const resultsContainer = document.getElementById("results-container");
const votingSection = document.getElementById("voting-section");
const resultsSection = document.getElementById("results-section");
const modal = document.getElementById("confirmation-modal");
const resetButton = document.getElementById("reset-button");

// --- New Auth Elements ---
const authSection = document.getElementById("auth-section");
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const userInfo = document.getElementById("user-info");
const userEmailEl = document.getElementById("user-email");

let voteToConfirm = null;
let currentUserId = null; // We will store the logged-in user's ID here

// --- Initialization ---
(async function init() {
  // Hide loading and show main content
  loadingEl.classList.add("hidden");
  mainContentEl.classList.remove("hidden");

  // Load options/results for everyone to see, even if not logged in
  loadOptions();

  // Listen for changes in login state (login, logout)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      // --- USER IS LOGGED IN ---
      currentUserId = session.user.id; // Get the unique user ID from Supabase
      userEmailEl.textContent = session.user.email;

      // Update UI
      loginButton.classList.add("hidden");
      userInfo.classList.remove("hidden");

      // Check if this user has already voted
      const hasVoted = await checkIfVoted();
      updateUiForVoteStatus(hasVoted);
    } else {
      // --- USER IS LOGGED OUT ---
      currentUserId = null;
      
      // Update UI
      loginButton.classList.remove("hidden");
      userInfo.classList.add("hidden");

      // Hide both voting and results sections
      votingSection.classList.add("hidden");
      resultsSection.classList.add("hidden");
    }
  });

  // Subscribe to real-time database changes
  supabase
    .channel("options-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "options" }, loadOptions)
    .subscribe();
})();

// --- Auth Button Listeners (FIXED) ---
loginButton.onclick = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
  });
  if (error) {
    console.error("Error signing in:", error.message);
  }
};

logoutButton.onclick = async () => {
  // This { scope: 'global' } is the fix.
  // It ensures the user is logged out of Google's session for this app.
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    console.error("Error signing out:", error.message);
  }
};

// --- Check if user already voted ---
async function checkIfVoted() {
  // If no one is logged in, they haven't voted
  if (!currentUserId) return false;

  const { data, error } = await supabase
    .from("voters")
    .select("user_id") // Only check for the ID
    .eq("user_id", currentUserId) // Use the REAL authenticated user ID
    .maybeSingle();

  if (error) {
    console.error("Error checking vote status:", error.message);
    return false;
  }
  
  return !!data; // true if a record was found, false otherwise
}

// --- Load & render options (No changes) ---
async function loadOptions() {
  const { data, error } = await supabase.from("options").select("*");
  if (error) {
    console.error(error);
    return;
  }
  renderOptions(data);
  renderResults(data);
}

// --- Render Options (No changes) ---
function renderOptions(options) {
  optionsContainer.innerHTML = "";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className =
      "p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300";
    btn.innerHTML = `
      <span class="block text-xl font-semibold text-gray-900 dark:text-white">${opt.name}</span>
      <span class="block text-sm text-gray-500 dark:text-gray-400 mt-1">Click to vote</span>`;
    btn.onclick = () => handleVote(opt.id, opt.name);
    optionsContainer.appendChild(btn);
  });
}

// --- Vote Logic (No changes) ---
function handleVote(optionId, optionName) {
  voteToConfirm = optionId;
  document.getElementById("modal-text").textContent = `Are you sure you want to vote for "${optionName}"?`;
  modal.classList.remove("hidden");
}

document.getElementById("cancel-vote").onclick = () => (modal.classList.add("hidden"));
document.getElementById("confirm-vote").onclick = confirmVote;

// --- Confirm Vote (No changes) ---
async function confirmVote() {
  if (!voteToConfirm || !currentUserId) {
    console.error("User not logged in or no option selected");
    return;
  }

  const alreadyVoted = await checkIfVoted();
  if (alreadyVoted) {
    alert("You have already voted!");
    modal.classList.add("hidden");
    return;
  }

  const { error: voterError } = await supabase
    .from("voters")
    .insert([{ user_id: currentUserId }]);

  if (voterError) {
    console.error("Error saving vote:", voterError.message);
    alert("Error: Could not record your vote. You may have already voted.");
    modal.classList.add("hidden");
    return;
  }

  await supabase.rpc("increment_vote", { option_id: voteToConfirm });

  modal.classList.add("hidden");
  updateUiForVoteStatus(true); // Show results
  loadOptions(); // Refresh results data
}

// --- Update UI (No changes) ---
function updateUiForVoteStatus(hasVoted) {
  if (hasVoted) {
    votingSection.classList.add("hidden");
    resultsSection.classList.remove("hidden");
  } else {
    votingSection.classList.remove("hidden");
    resultsSection.classList.add("hidden");
  }
}

// --- Render Results (No changes) ---
function renderResults(options) {
  resultsContainer.innerHTML = "";
  const total = options.reduce((a, b) => a + b.votes, 0);
  options.forEach((opt) => {
    const percent = total ? ((opt.votes / total) * 100).toFixed(1) : 0;
    resultsContainer.innerHTML += `
      <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-3">
        <div class="flex justify-between items-center mb-1">
          <span class="font-semibold">${opt.name}</span>
          <span class="text-sm font-bold text-gray-700 dark:text-gray-300">
            ${opt.votes} votes (${percent}%)
          </span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
          <div class="progress-bar-inner bg-indigo-500 h-4 rounded-full" style="width:${percent}%"></div>
        </div>
      </div>`;
  });
}

// --- Reset Votes (No changes) ---
resetButton.onclick = async () => {
  if (!confirm("Reset all votes?")) return;

  const { error: votersError } = await supabase.from("voters").delete().neq("user_id", "0");
  if (votersError) console.error("Error resetting voters:", votersError.message);

  const { error: optionsError } = await supabase.from("options").update({ votes: 0 }).neq("id", 0);
  if (optionsError) console.error("Error resetting options:", optionsError.message);

  alert("All votes reset.");
  loadOptions();
};