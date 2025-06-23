import React from 'react';

interface Question {
  id: string;
  question: string;
  answer: string;
  options: string[];
  hint?: string;
  explanation?: string;
}

interface QuestionListProps {
  questions: Question[];
}

const QuestionList: React.FC<QuestionListProps> = ({ questions }) => {
  return (
    <div>
      <h2>Generated Questions</h2>
      {questions.length === 0 ? (
        <p>No questions generated yet.</p>
      ) : (
        <ul>
          {questions.map((q) => (
            <li key={q.id}>
              <h3>{q.question}</h3>
              <p><strong>Answer:</strong> {q.answer}</p>
              {q.options.length > 0 && (
                <div>
                  <strong>Options:</strong>
                  <ul>
                    {q.options.map((option, index) => (
                      <li key={index}>{option}</li>
                    ))}
                  </ul>
                </div>
              )}
              {q.hint && <p><strong>Hint:</strong> {q.hint}</p>}
              {q.explanation && <p><strong>Explanation:</strong> {q.explanation}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default QuestionList; 