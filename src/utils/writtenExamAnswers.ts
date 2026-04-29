export function getAnswerKeys(answer: string | string[] | undefined | null): string[] {
  const rawAnswer = Array.isArray(answer) ? answer.join(',') : answer || '';

  return rawAnswer
    .split(',')
    .map(key => key.trim().toUpperCase())
    .filter(Boolean)
    .sort();
}

export function areAnswerSetsEqual(correctAnswer: string | string[] | undefined | null, userAnswer: string | string[] | undefined | null): boolean {
  const correctAnswers = getAnswerKeys(correctAnswer);
  const userAnswers = getAnswerKeys(userAnswer);

  return (
    correctAnswers.length > 0 &&
    correctAnswers.length === userAnswers.length &&
    correctAnswers.every((val, idx) => val === userAnswers[idx])
  );
}

export function getRequiredAnswerCount(correctAnswer: string | string[] | undefined | null): number {
  return getAnswerKeys(correctAnswer).length;
}

export function getQuestionMaxPoints(correctAnswer: string | string[] | undefined | null): number {
  return getRequiredAnswerCount(correctAnswer);
}

export function scoreQuestionPoints(correctAnswer: string | string[] | undefined | null, userAnswer: string | string[] | undefined | null): number {
  const correctAnswers = getAnswerKeys(correctAnswer);
  const userAnswers = getAnswerKeys(userAnswer);

  if (correctAnswers.length === 0 || userAnswers.length === 0) return 0;

  if (correctAnswers.length === 1) {
    return userAnswers.length === 1 && userAnswers[0] === correctAnswers[0] ? 1 : 0;
  }

  return userAnswers.filter(answer => correctAnswers.includes(answer)).length;
}
