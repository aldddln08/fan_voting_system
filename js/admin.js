// Use the SAME Supabase credentials as app.js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const candidatesContainer = document.getElementById('candidates-container');
const revealButton = document.getElementById('reveal-button');

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

// 3. Listen for REAL-TIME changes to the votes
supabase
    .channel('public:candidates')
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'candidates' },
        (payload) => {
            console.log('Vote received!', payload);
            // Find and update the candidate in our local list
            const updatedCandidate = payload.new;
            const index = currentCandidates.findIndex(c => c.id === updatedCandidate.id);
            if (index !== -1) {
                currentCandidates[index] = updatedCandidate;
            } else {
                currentCandidates.push(updatedCandidate);
            }
            // Re-sort and update UI
            currentCandidates.sort((a, b) => b.vote_count - a.vote_count);
            updateVotesUI(currentCandidates);
        }
    )
    .subscribe();

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

// Initial load
fetchVotes();