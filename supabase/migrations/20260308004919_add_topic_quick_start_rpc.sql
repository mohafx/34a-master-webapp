create or replace function public.get_topic_quick_start_questions(
    module_uuid uuid,
    question_limit integer default 4
)
returns table (
    id uuid,
    module_id uuid,
    module_name text,
    text_de text,
    explanation_de text,
    correct_answer text,
    answer_a_de text,
    answer_b_de text,
    answer_c_de text,
    answer_d_de text,
    answer_e_de text,
    answer_f_de text
)
language sql
security definer
set search_path = public
as $$
    select
        q.id,
        q.module_id,
        m.title_de as module_name,
        q.text_de,
        q.explanation_de,
        q.correct_answer,
        q.answer_a_de,
        q.answer_b_de,
        q.answer_c_de,
        q.answer_d_de,
        q.answer_e_de,
        q.answer_f_de
    from public.questions q
    join public.modules m on m.id = q.module_id
    where q.module_id = module_uuid
    order by random()
    limit greatest(1, least(coalesce(question_limit, 4), 10));
$$;

grant execute on function public.get_topic_quick_start_questions(uuid, integer) to anon, authenticated;;
