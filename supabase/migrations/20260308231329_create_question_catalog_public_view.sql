create or replace view public.question_catalog_public as
select
  q.id,
  q.module_id,
  q.order_index,
  q.global_order_index,
  q.text_de,
  q.explanation_de,
  q.correct_answer,
  q.type,
  q.answer_a_de,
  q.answer_b_de,
  q.answer_c_de,
  q.answer_d_de,
  q.answer_e_de,
  q.answer_f_de
from public.questions q;

grant select on public.question_catalog_public to anon, authenticated;;
