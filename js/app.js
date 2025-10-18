// 1. SUPABASE CLIENT INITIALIZATION
// Get these from your Supabase project's "API Settings"
const SUPABASE_URL = 'https://oxsqjmwskfsfiytzxyvd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94c3FqbXdza2ZzZml5dHp4eXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3Nzc4NTUsImV4cCI6MjA3NjM1Mzg1NX0.2Q8IEjbeKBjomJQ2C_SXa2SbPa1ldX-dJAEliSxOEHc';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. DOM ELEMENTS
const loginScreen = document.getElementById('login-screen');
const loadingScreen = document.getElementById('loading-screen');
const userInfo = document.getElementById('user-info');
const votingScreen = document.getElementById('voting-screen');
const waitingScreen = document.getElementById('waiting-screen');
const winnerScreen = document.getElementById('winner-screen');

const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userEmail = document.getElementById('user-email');
const candidatesList = document.getElementById('candidates-list');
const winnerName = document.getElementById('winner-name');

// 3. AUTHENTICATION
loginButton.addEventListener('click', () => {
    supabase.auth.signInWithOAuth({
        provider: 'google',
    });
});

logoutButton.addEventListener('click', () => {
    supabase.auth.signOut();
});

// 4. MAIN APP LOGIC
// This function checks the session and routes the user
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        showScreen('login');
    } else {
        userEmail.textContent = session.user.email;
        showScreen('loading'); // Show loading while we fetch app state
        await loadAppState(session.user);
    }
}

// Check for auth changes (login/logout)
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
        userEmail.textContent = session.user.email;
        showScreen('loading');
        loadAppState(session.user);
    } else if (event === 'SIGNED_OUT') {
        showScreen('login');
    }
});

// This is the main router for the UI
async function loadAppState(user) {
    // 1. Check the global app_state table
    const { data: state, error: stateError } = await supabase
        .from('app_state')
        .select('*')
        .eq('id', 1)
        .single();

    if (stateError) {
        console.error(stateError);
        return;
    }

    // CASE 1: Winner has been revealed
    if (state.winner_revealed) {
        await showWinner(state.winner_id);
    } 
    // CASE 2: Voting is still open
    else {
        // Check if this specific user has voted
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('has_voted')
            .eq('id', user.id)
            .single();

        // This handles new users who don't have a profile row yet
        if (profileError && profileError.code === 'PGRST116') {
            // No profile found, let's create one
            await supabase.from('profiles').insert({ id: user.id, has_voted: false });
            showScreen('voting');
            await loadCandidates();
        } 
        // CASE 2a: User has already voted
        else if (profile && profile.has_voted) {
            showScreen('waiting');
        } 
        // CASE 2b: User has not voted
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

// 5. REAL-TIME LISTENER
// This listens for the admin revealing the winner
supabase
    .channel('public:app_state')
    .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'app_state', filter: 'id=eq.1' },
        (payload) => {
            console.log('App state changed!', payload);
            const newState = payload.new;
            if (newState.winner_revealed) {
                // The admin just revealed the winner!
                showWinner(newState.winner_id);
            }
        }
    )
    .subscribe();


// 6. HELPER FUNCTION to manage UI
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

// 7. INITIALIZE
checkSession();