# Fan Voting System

A real-time fan voting application built with plain HTML/CSS/JS and a Supabase backend. This project allows users to log in with Google to cast a single, secure vote. A designated admin can monitor the votes live, reveal the winner to all users, and reset the entire poll.

**Live Demo:** [[[Link to your live OnRender site here](https://fan-voting-system.onrender.com)]]


## Features

### User Features
* **Secure Google Login:** Users must log in with their Gmail account.
* **One Vote Per User:** The system securely prevents users from voting more than once.
* **"Waiting" State:** After voting, users see a "please wait" screen.
* **Live Winner Reveal:** When the admin reveals the winner, the user's screen updates automatically to show the winner *without* needing a refresh.
* **Secure & Anonymous:** User votes are private and cannot be seen by other users.

### Admin Features
* **Admin-Only Access:** An "Admin Options" button only appears for users with an `admin` role in the database.
* **Live Vote Count:** The admin dashboard shows a live, real-time count of votes for each candidate, updating every few seconds.
* **Reveal Winner:** The admin has a button to end the poll and reveal the winner to all active users.
* **Reset All Votes:** A secure "Reset" button allows the admin to set all vote counts to 0 and allow all users to vote again.

## Tech Stack

* **Frontend:** Plain HTML, CSS, and JavaScript (ES6+ Modules)
* **Backend:** [Supabase](https://supabase.com/)
* **Database:** Supabase (PostgreSQL)
* **Authentication:** Supabase Auth (Google Provider)
* **Serverless Functions:** PostgreSQL functions (`handle_vote`, `reset_all_votes`) for secure, server-side logic.

## Core Concepts

This project's security relies on two key Supabase features:

1.  **Row Level Security (RLS):** RLS policies are enabled on all tables. This ensures that users can *only* read or update their own data. For example, a user can only `SELECT` their own row from the `profiles` table, and they cannot `UPDATE` the vote counts on the `candidates` table.

2.  **PostgreSQL Functions:** Users never update the database directly. All critical actions are handled by `SECURITY DEFINER` functions in Postgres:
    * `handle_vote(candidate_id)`: This function checks if the user has already voted. If not, it records their vote and increments the candidate's `vote_count` all in one secure, server-side transaction.
    * `reset_all_votes()`: This function first checks if the caller has the `admin` role. If so, it resets all tables to their default state.

## Local Setup & Installation

To run this project locally, follow these steps:

1.  **Clone the Repository**
    ```sh
    git clone [your-repo-url]
    cd fan-voting-system
    ```

2.  **Create a Supabase Project**
    * Go to [supabase.com](https://supabase.com) and create a new project.
    * Save your **Project URL** and **`anon` (public) Key**.

3.  **Run the Supabase SQL Setup**
    * Go to the **SQL Editor** in your Supabase project.
    * Copy the entire contents of `setup.sql` (pasted below) and run it. This will create your tables, functions, and all RLS policies.

4.  **Set Up Google Authentication**
    * Go to **Authentication** -> **Providers** in Supabase and enable **Google**.
    * Follow the instructions to get your Google Client ID and Secret.
    * Go to your **Google Cloud Console** and add your local URL (`http://127.0.0.1:5500` or `http://localhost:3000`) to the "Authorized JavaScript origins" and "Authorized redirect URIs".

5.  **Add Your Supabase Keys**
    * In the `js/` folder, create a new file named `config.js` (this file is in `.gitignore` to protect your keys).
    * Paste your Supabase credentials into it:
        ```javascript
        // js/config.js
        export const SUPABASE_URL = 'YOUR_SUPABASE_URL';
        export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
        ```
    * Our `js/supabaseClient.js` file already reads from this.

6.  **Set Your Admin Account**
    * Run the project in your browser (e.g., with the VS Code "Live Server" extension).
    * Log in with the Google account you want to be the admin.
    * Go to the **Table Editor** in Supabase, open the `profiles` table, and find your user row.
    * Change the `role` column for your user from `user` to `admin`.

7.  **Run the Project**
    * Open `index.html` with a local server (like VS Code's "Live Server").
    * The "Admin Options" button should now be visible when you log in.

---

## Supabase `setup.sql`

Copy and run this entire block in your Supabase SQL Editor.

```sql
-- 1. Table for candidates
CREATE TABLE candidates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  vote_count INT DEFAULT 0
);

-- 2. Table for user profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  has_voted BOOLEAN DEFAULT FALSE,
  voted_for INT REFERENCES candidates(id),
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'user'
);

-- 3. Table for global app state
CREATE TABLE app_state (
  id INT PRIMARY KEY DEFAULT 1,
  winner_revealed BOOLEAN DEFAULT FALSE,
  winner_id INT REFERENCES candidates(id),
  CONSTRAINT singleton CHECK (id = 1) 
);

-- 4. Insert initial app state
INSERT INTO app_state (id, winner_revealed, winner_id)
VALUES (1, FALSE, NULL);

-- 5. Insert dummy candidates
INSERT INTO candidates (name)
VALUES ('Candidate Alpha'), ('Candidate Bravo'), ('Candidate Charlie');

-- 6. Create the secure voting function
CREATE OR REPLACE FUNCTION handle_vote(candidate_id_to_vote_for INT)
RETURNS VOID AS $$
DECLARE
  user_id UUID := auth.uid();
BEGIN
  -- Check if the user has already voted
  IF EXISTS (SELECT 1 FROM profiles WHERE id = user_id AND has_voted = TRUE) THEN
    RAISE EXCEPTION 'User has already voted';
  END IF;
  
  -- Record the vote
  UPDATE profiles
  SET has_voted = TRUE, voted_for = candidate_id_to_vote_for
  WHERE id = user_id;
  
  -- Increment the vote count
  UPDATE candidates
  SET vote_count = vote_count + 1
  WHERE id = candidate_id_to_vote_for;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create the secure reset function
CREATE OR REPLACE FUNCTION reset_all_votes()
RETURNS VOID AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Check if the user is an admin
  SELECT role INTO user_role FROM public.profiles
  WHERE id = auth.uid();
  
  IF user_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can reset votes';
  END IF;

  -- Reset all profiles
  UPDATE public.profiles
  SET has_voted = false, voted_for = NULL
  WHERE true;

  -- Reset all candidate vote counts
  UPDATE public.candidates
  SET vote_count = 0
  WHERE true;
  
  -- Reset the app state
  UPDATE public.app_state
  SET winner_revealed = false, winner_id = NULL
  WHERE id = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Enable Row Level Security (RLS) for all tables
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS Policies

-- Allow everyone to read app state
CREATE POLICY "Allow all users to read app_state"
ON public.app_state FOR SELECT
TO public
USING (true);

-- Allow everyone to read candidates
CREATE POLICY "Allow all users to read candidates"
ON public.candidates FOR SELECT
TO public
USING (true);

-- Allow users to read their own profile
CREATE POLICY "Allow users to read their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow users to create their own profile
CREATE POLICY "Allow users to create their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile (for voting)
CREATE POLICY "Allow users to update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow admins to update app_state (to reveal winner)
CREATE POLICY "Allow admins to update app_state"
ON public.app_state FOR UPDATE
TO authenticated
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
