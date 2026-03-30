interface ScoreGaugeProps { score: number | null; }

function getGradeColour(grade: string): string {
  const map: Record<string, string> = { A: 'text-accent-green', B: 'text-accent-blue', C: 'text-accent-yellow', D: 'text-accent-orange', F: 'text-accent-red' };
  return map[grade] || 'text-gray-400';
}

function getLetterGrade(score: number): string {
  if (score >= 90) return 'A'; if (score >= 75) return 'B'; if (score >= 60) return 'C'; if (score >= 40) return 'D'; return 'F';
}

export default function ScoreGauge({ score }: ScoreGaugeProps) {
  if (score === null) return (<div className="flex flex-col items-center justify-center p-6"><p className="text-5xl font-bold text-gray-500">--</p><p className="text-sm text-gray-400 mt-2">No runs yet</p></div>);
  const grade = getLetterGrade(score);
  return (<div className="flex flex-col items-center justify-center p-6"><p className={`text-6xl font-bold ${getGradeColour(grade)}`}>{Math.round(score)}</p><p className={`text-2xl font-bold mt-1 ${getGradeColour(grade)}`}>{grade}</p><p className="text-sm text-gray-400 mt-1">Overall Score</p></div>);
}
