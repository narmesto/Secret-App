-- This function correctly queries both dm_threads and the main threads table
-- to create a unified list of all conversations.
-- It uses a combined participant list from both thread_participants and chat_messages to ensure accuracy.
DROP FUNCTION IF EXISTS public.get_user_threads_with_unread_count(uuid);

CREATE OR REPLACE FUNCTION get_user_threads_with_unread_count(p_user_id UUID)
RETURNS TABLE(
    id UUID,
    created_at TIMESTAMPTZ,
    is_dm BOOLEAN,
    title TEXT,
    avatar_url TEXT,
    last_message TEXT,
    last_message_at TIMESTAMPTZ,
    participants JSON,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH
    -- CTE for Direct Messages (This part is working and is preserved)
    dm_data AS (
        SELECT
            dmt.id,
            dmt.created_at,
            CASE
                WHEN dmt.user_low = p_user_id THEN dmt.user_high
                ELSE dmt.user_low
            END AS peer_id
        FROM public.dm_threads dmt
        WHERE dmt.user_low = p_user_id OR dmt.user_high = p_user_id
    ),

    -- CTEs for Group Chats (New robust logic)
    user_group_threads AS (
        -- Find all group threads the user is associated with, from either table
        SELECT thread_id FROM public.thread_participants WHERE user_id = p_user_id
        UNION
        SELECT thread_id FROM public.chat_messages WHERE sender_id = p_user_id
    ),
    all_participants_in_groups AS (
        -- For those threads, get a complete list of all participants from both tables
        SELECT thread_id, user_id FROM public.thread_participants
        WHERE thread_id IN (SELECT thread_id FROM user_group_threads)
        UNION
        SELECT thread_id, sender_id AS user_id FROM public.chat_messages
        WHERE thread_id IN (SELECT thread_id FROM user_group_threads)
    ),
    participants_json AS (
        -- Build the final JSON object for the complete participant list of each thread
        SELECT
            apig.thread_id,
            json_agg(json_build_object('id', apig.user_id, 'username', pp.username, 'avatar_url', p.avatar_url)) AS participants
        FROM all_participants_in_groups apig
        LEFT JOIN public.profiles p ON apig.user_id = p.id
        LEFT JOIN public.profiles_public pp ON apig.user_id = pp.id
        GROUP BY apig.thread_id
    ),
    group_titles AS (
        SELECT
            apig.thread_id,
            string_agg(pp.username, ', ') AS generated_title
        FROM all_participants_in_groups apig
        JOIN public.profiles_public pp ON apig.user_id = pp.id
        WHERE apig.user_id != p_user_id
        GROUP BY apig.thread_id
    ),
    last_dm_message AS (
        SELECT DISTINCT ON (thread_id)
            thread_id,
            body,
            public.dm_messages.created_at
        FROM public.dm_messages
        ORDER BY thread_id, public.dm_messages.created_at DESC
    ),
    last_chat_message AS (
        SELECT DISTINCT ON (thread_id)
            thread_id,
            body,
            public.chat_messages.created_at
        FROM public.chat_messages
        ORDER BY thread_id, public.chat_messages.created_at DESC
    )

    -- Part 1: Select all Direct Messages
    SELECT
        dm.id,
        dm.created_at,
        true AS is_dm,
        peer_profile_public.username AS title,
        peer_profile.avatar_url AS avatar_url,
        COALESCE(ldm.body, 'Tap to see messages') AS last_message,
        COALESCE(ldm.created_at, dm.created_at) AS last_message_at,
        json_build_array(
            json_build_object('id', user_profile.id, 'username', user_profile_public.username, 'avatar_url', user_profile.avatar_url),
            json_build_object('id', peer_profile.id, 'username', peer_profile_public.username, 'avatar_url', peer_profile.avatar_url)
        ) AS participants,
        0::BIGINT AS unread_count
    FROM dm_data dm
    JOIN public.profiles peer_profile ON dm.peer_id = peer_profile.id
    JOIN public.profiles_public peer_profile_public ON dm.peer_id = peer_profile_public.id
    JOIN public.profiles user_profile ON p_user_id = user_profile.id
    JOIN public.profiles_public user_profile_public ON p_user_id = user_profile_public.id
    LEFT JOIN last_dm_message ldm ON dm.id = ldm.thread_id

    UNION ALL

    -- Part 2: Select all Group Chats using the robust participant list
    SELECT
        t.id,
        t.created_at,
        false AS is_dm,
        COALESCE(t.name, gt.generated_title, 'Group Chat') AS title,
        t.avatar_url,
        COALESCE(lcm.body, 'Tap to see messages') AS last_message,
        COALESCE(lcm.created_at, t.created_at) AS last_message_at,
        pj.participants,
        0::BIGINT AS unread_count
    FROM public.threads t
    JOIN participants_json pj ON t.id = pj.thread_id
    LEFT JOIN group_titles gt ON t.id = gt.thread_id
    LEFT JOIN last_chat_message lcm ON t.id = lcm.thread_id;

END;
$$ LANGUAGE plpgsql;
