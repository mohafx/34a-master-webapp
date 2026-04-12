import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildLessonQuestionPath } from '../../services/lessonFlow';

export default function LessonQuiz() {
  const { moduleId, lessonId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!moduleId || !lessonId) {
      navigate('/learn', { replace: true });
      return;
    }

    navigate(buildLessonQuestionPath(moduleId, lessonId), {
      replace: true,
      state: {
        fromLesson: true,
      },
    });
  }, [lessonId, moduleId, navigate]);

  return null;
}
