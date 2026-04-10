import type { Question } from '../state/slices/error-slice';
import styles from './QuestionPopover.module.css';

interface QuestionPopoverProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onClose: () => void;
}

/**
 * Popover displayed when the agent sends an "ask" message with options.
 * Shows the question text and option buttons.
 * Clicking an option sends the answer via WebSocket and auto-dismisses.
 * A backdrop overlay focuses attention on the popover.
 */
export function QuestionPopover({ question, onAnswer, onClose }: QuestionPopoverProps) {
  const handleAnswer = (option: string) => {
    onAnswer(option);
  };

  return (
    <div class={styles.backdrop} onClick={onClose}>
      <div class={styles.popover} onClick={(e) => e.stopPropagation()}>
        <p class={styles.question}>{question.text}</p>
        {question.options && question.options.length > 0 && (
          <div class={styles.options}>
            {question.options.map((option) => (
              <button
                key={option}
                class={styles.option}
                onClick={() => handleAnswer(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
