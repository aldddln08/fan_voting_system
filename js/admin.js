// Supabase Client Initialization
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const candidatesContainer = document.getElementById('candidates-container');
const revealButton = document.getElementById('reveal-button');
const resetAllButton = document.getElementById('reset-all-button');

let currentCandidates = []; // Store current vote counts

// 1. Fetch initial vote counts
async function fetchVotes() {
    const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('vote_count', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }
    
    currentCandidates = data; // Save for later
    updateVotesUI(data);
}

// 2. Update the UI with vote counts
function updateVotesUI(candidates) {
    candidatesContainer.innerHTML = '';
    for (const candidate of candidates) {
        const div = document.createElement('div');
        div.classList.add('candidate');
        div.textContent = `${candidate.name}: ${candidate.vote_count} votes`;
        candidatesContainer.appendChild(div);
    }
}


// 4. Handle the "Reveal Winner" button
revealButton.addEventListener('click', async () => {
    if (!confirm('ARE YOU SURE? This will end the vote and show the winner to all users.')) {
        return;
    }

    // Find the candidate with the most votes
    if (currentCandidates.length === 0) {
        alert('No candidates found or still loading.');
        return;
    }

    // The list is already sorted, so the winner is the first one
    const winner = currentCandidates[0];

    // Update the global app_state
    const { error } = await supabase
        .from('app_state')
        .update({ winner_revealed: true, winner_id: winner.id })
        .eq('id', 1); // Update the single row

    if (error) {
        alert('Error revealing winner: ' + error.message);
    } else {
        alert('Winner has been revealed!');
        revealButton.disabled = true;
        revealButton.textContent = 'WINNER REVEALED';
    }
});

resetAllButton.addEventListener('click', async () => {
    // Add two confirmations because this is very destructive
    if (!confirm('ARE YOU 100% SURE? This will delete all votes and reset the entire system. This cannot be undone.')) {
        return;
    }
    if (!confirm('SECOND CONFIRMATION: Are you absolutely sure?')) {
        return;
    }

    console.log("Calling reset_all_votes function...");

    // Call the new function we just created
    const { error } = await supabase.rpc('reset_all_votes');

    if (error) {
        console.error(error);
        alert('Error resetting votes: ' + error.message);
    } else {
        alert('SUCCESS: All votes have been reset.');

        // Manually refresh the vote counts on the admin page
        fetchVotes(); 

        // Also re-enable the reveal button
        revealButton.disabled = false;
        revealButton.textContent = '!!! REVEAL WINNER TO ALL USERS !!!';
    }
});

// Initial load
function startVotePolling() {
    console.log("Polling for new votes...");
    fetchVotes(); // Call it once immediately
    
    // Then call it again every 3 seconds
    setInterval(fetchVotes, 3000); // 3000ms = 3 seconds
}

startVotePolling();