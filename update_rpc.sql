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
    -- DM threads
    select
        t.id as thread_id,
        false as is_group,
        0::bigint as unread_count,
        coalesce(last_msg.body, 'No messages yet') as last_message_content,
        last_msg.created_at as last_message_created_at
    from
        dm_threads as t
    left join lateral (
        select body, created_at
        from dm_messages
        where dm_messages.thread_id = t.id
        order by created_at desc
        limit 1
    ) as last_msg on true
    where
        t.user_low = p_user_id or t.user_high = p_user_id

    union all

    -- Group threads
    select
        t.id as thread_id,
        true as is_group,
        0::bigint as unread_count,
        coalesce(last_msg.body, 'No messages yet') as last_message_content,
        last_msg.created_at as last_message_created_at
    from
        threads as t
    inner join
        thread_participants as tp on t.id = tp.thread_id
    left join lateral (
        select body, created_at
        from chat_messages
        where chat_messages.thread_id = t.id
        order by created_at desc
        limit 1
    ) as last_msg on true
    where
        tp.user_id = p_user_id;
end;
$$ language plpgsql stable;