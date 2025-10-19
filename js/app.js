// Supabase Client Initialization
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Dom Elements
const loginScreen = document.getElementById('login-screen');
const loadingScreen = document.getElementById('loading-screen');
const userInfo = document.getElementById('user-info');
const votingScreen = document.getElementById('voting-screen');
const waitingScreen = document.getElementById('waiting-screen');
const winnerScreen = document.getElementById('winner-screen');

const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userEmail = document.getElementById('user-email');
const adminButton = document.getElementById('admin-button');
const candidatesList = document.getElementById('candidates-list');
const winnerName = document.getElementById('winner-name');

let winnerPoller = null;

// Auth
loginButton.addEventListener('click', () => {
    supabase.auth.signInWithOAuth({
        provider: 'google',
    });
});

logoutButton.addEventListener('click', () => {
    if (winnerPoller) {
        clearInterval(winnerPoller);
    }
    supabase.auth.signOut();
});

adminButton.addEventListener('click', () => {
    window.open('admin.html', '_blank');
});

// Session and routes of the user
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        showScreen('login');
    } else {
        userEmail.textContent = session.user.email;
        showScreen('loading');
        await loadAppState(session.user);
    }
}

// Login and Logout
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
        userEmail.textContent = session.user.email;
        showScreen('loading');
        loadAppState(session.user);
    } else if (event === 'SIGNED_OUT') {
        showScreen('login');
    }
});

// App state for the user's UI
async function loadAppState(user) {
    // app_state table in supabase
    const { data: state, error: stateError } = await supabase
        .from('app_state')
        .select('*')
        .eq('id', 1)
        .single();

    if (stateError) {
        console.error(stateError);
        return;
    }

    // Winner has been revealed
    if (state.winner_revealed) {
        await showWinner(state.winner_id);
    } 
    // Voting is still open
    else {
        startPollingForWinner();
        // Check user's voting status AND role in one call
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('has_voted, role')
            .eq('id', user.id)
            .single();

        // Admin button visibility
        if (profile && profile.role === 'admin') {
            adminButton.classList.remove('hidden');
        } else {
            adminButton.classList.add('hidden');
        }

        // For new users without a profile
        if (profileError && profileError.code === 'PGRST116') {

            const { error: upsertError } = await supabase.from('profiles').upsert({ 
              id: user.id, 
              email: user.email,
              has_voted: false, // Has not yet voted
              role: 'user',
              name: user.user_metadata.full_name
            });

            if (upsertError) {
              console.error("Error creating profile:", upsertError);
            } else {
              showScreen('voting');
              await loadCandidates();
            }
        }
        // User has already voted
        else if (profile && profile.has_voted) {
            showScreen('waiting');
        }
        // User has not voted
        else {
            showScreen('voting');
            await loadCandidates();
        }
    }
}

// Fetch and display the winner
async function showWinner(winnerId) {
    const { data: candidate } = await supabase
        .from('candidates')
        .select('name')
        .eq('id', winnerId)
        .single();
    
    if (candidate) {
        winnerName.textContent = `🎉 ${candidate.name} 🎉`;
        showScreen('winner');
    }
}

// Fetch candidates and create voting buttons
async function loadCandidates() {
    const { data: candidates, error } = await supabase
        .from('candidates')
        .select('id, name');

    if (error) {
        console.error(error);
        return;
    }

    candidatesList.innerHTML = ''; // Clear list
    for (const candidate of candidates) {
        const button = document.createElement('button');
        button.textContent = `Vote for ${candidate.name}`;
        button.classList.add('candidate-button');
        button.onclick = () => handleVote(candidate.id);
        candidatesList.appendChild(button);
    }
}

// Handle the user's vote
async function handleVote(candidateId) {
    showScreen('loading'); // Show loading screen while vote is processing
    
    // Call the secure Postgres function we created
    const { error } = await supabase.rpc('handle_vote', {
        candidate_id_to_vote_for: candidateId
    });

    if (error) {
        console.error('Vote Error:', error.message);
        alert(`Error: ${error.message}`); // e.g., "User has already voted"
        // Re-load the app state to show the correct screen
        const { data: { user } } = await supabase.auth.getUser();
        loadAppState(user);
    } else {
        // Vote successful!
        showScreen('waiting');
    }
}

// POLLING FUNCTION (Replaces Real-time)
function startPollingForWinner() {
    // Clear any old pollers just in case
    if (winnerPoller) {
        clearInterval(winnerPoller);
    }
    
    console.log("Starting to poll for winner...");
    checkWinnerNow();

    // Check for the winner every 3 seconds
    winnerPoller = setInterval(checkWinnerNow, 3000);
}

async function checkWinnerNow() {
    try {
        console.log("Checking for winner...");
        
        // This makes the request unique every time to bypass the cache.
        const { data: state, error } = await supabase
            .from('app_state')
            .select('winner_revealed, winner_id')
            .eq('id', 1)
            // The cache buster: id is not equal to a random new timestamp
            .neq('id', Math.floor(Math.random() * 1000000))
            .single();

        if (error) {
            console.error("Error polling for winner:", error.message);
            return; // Try again next time
        }

        if (state && state.winner_revealed) {
            console.log("Winner found!");
            if (winnerPoller) {
                clearInterval(winnerPoller);
            }
            await showWinner(state.winner_id);
        }
    } catch (e) {
        console.error("Critical error in poller:", e);
    }
}


// HELPER FUNCTION to manage UI
function showScreen(screenName) {
    // Hide all screens
    loginScreen.classList.add('hidden');
    loadingScreen.classList.add('hidden');
    userInfo.classList.add('hidden');
    votingScreen.classList.add('hidden');
    waitingScreen.classList.add('hidden');
    winnerScreen.classList.add('hidden');

    // Show the requested screen
    if (screenName === 'login') {
        loginScreen.classList.remove('hidden');
    } else {
        // If not logging in, always show the user info/logout bar
        userInfo.classList.remove('hidden');
        document.getElementById(`${screenName}-screen`).classList.remove('hidden');
    }
}

// Initialize
checkSession();