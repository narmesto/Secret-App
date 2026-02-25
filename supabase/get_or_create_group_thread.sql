CREATE OR REPLACE FUNCTION get_or_create_group_thread(p_user_ids UUID[])
RETURNS TABLE(thread_id UUID) AS $$
DECLARE
    v_thread_id UUID;
    v_user_id UUID := auth.uid();
    v_search_participants_array UUID[];
BEGIN
    -- Add the current user to the list of participants if not already included
    IF NOT (p_user_ids @> ARRAY[v_user_id]) THEN
        p_user_ids := array_append(p_user_ids, v_user_id);
    END IF;

    -- Create a sorted array of the participants to search for
    SELECT array_agg(uid ORDER BY uid) INTO v_search_participants_array FROM unnest(p_user_ids) uid;

    -- Look for an existing group thread with the exact same participants
    WITH existing_threads AS (
        SELECT
            tp.thread_id,
            array_agg(tp.user_id ORDER BY tp.user_id) as participants
        FROM thread_participants tp
        GROUP BY tp.thread_id
    )
    SELECT et.thread_id INTO v_thread_id
    FROM existing_threads et
    WHERE et.participants = v_search_participants_array;

    -- If a thread is found, return its ID
    IF v_thread_id IS NOT NULL THEN
        RETURN QUERY SELECT v_thread_id;
        RETURN;
    END IF;

    -- If no thread is found, create a new one
    INSERT INTO public.threads (is_group, name)
    VALUES (true, null)
    RETURNING id INTO v_thread_id;

    -- Insert participants
    INSERT INTO public.thread_participants (thread_id, user_id)
    SELECT v_thread_id, unnest(p_user_ids);

    -- Return the new thread ID
    RETURN QUERY SELECT v_thread_id;

END;
$$ LANGUAGE plpgsql;