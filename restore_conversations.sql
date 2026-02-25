create or replace function public.get_user_threads_with_unread_count(p_user_id uuid)
returns table (
    thread_id uuid,
    is_group boolean,
    unread_count bigint,
    last_message_content text,
    last_message_created_at timestamptz
)
as $$
begin
return query
    -- DM threads (super simple version)
    select
        t.id as thread_id,
        false as is_group,
        0::bigint as unread_count,
        '...' as last_message_content,
        now() as last_message_created_at
    from
        dm_threads as t
    where
        t.user_low = p_user_id or t.user_high = p_user_id

    union all

    -- Group threads (super simple version)
    select
        t.id as thread_id,
        true as is_group,
        0::bigint as unread_count,
        '...' as last_message_content,
        now() as last_message_created_at
    from
        threads as t
    inner join
        thread_participants as tp on t.id = tp.thread_id
    where
        tp.user_id = p_user_id;
end;
$$ language plpgsql stable;