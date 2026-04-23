"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";

import styles from "./styles/create-poll.module.scss";

export interface ICreatePollData {
  options: string[];
  duration: 1 | 3 | 7;
}

interface CreatePollProps {
  onPollChange: (poll: ICreatePollData | null) => void;
  onRemove?: () => void;
}

export const CreatePoll = ({ onPollChange }: CreatePollProps) => {
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [duration, setDuration] = useState<1 | 3 | 7>(1);
  const [error, setError] = useState<string | null>(null);

  const updatePoll = useCallback(
    (newOptions: string[], newDuration: 1 | 3 | 7) => {
      const trimmedOptions = newOptions
        .map((o) => o.trim())
        .filter((o) => o !== "");

      if (trimmedOptions.length >= 2) {
        const uniqueOptions = new Set(trimmedOptions);
        if (uniqueOptions.size === trimmedOptions.length) {
          setError(null);
          onPollChange({
            options: trimmedOptions,
            duration: newDuration,
          });
        } else {
          setError("Poll options must be unique");
          onPollChange(null);
        }
      } else {
        setError("Poll must have at least 2 non-empty options");
        onPollChange(null);
      }
    },
    [onPollChange],
  );

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
    updatePoll(newOptions, duration);
  };

  const addOption = () => {
    if (options.length < 4) {
      const newOptions = [...options, ""];
      setOptions(newOptions);
      updatePoll(newOptions, duration);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
      updatePoll(newOptions, duration);
    }
  };

  const handleDurationChange = (newDuration: 1 | 3 | 7) => {
    setDuration(newDuration);
    updatePoll(options, newDuration);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={styles.container}
    >
      <div className={styles.optionsContainer}>
        <AnimatePresence>
          {options.map((option, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={styles.optionRow}
            >
              <input
                type="text"
                value={option}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                className={styles.optionInput}
                maxLength={25}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className={styles.removeButton}
                  aria-label={`Remove option ${index + 1}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    aria-hidden="true"
                  >
                    <g>
                      <path d="M10.59 13.41l7.89 7.89-1.41 1.41-7.89-7.89-7.89 7.89-1.41-1.41 7.89-7.89-7.89-7.89 1.41-1.41 7.89 7.89 7.89-7.89 1.41 1.41-7.89 7.89z"></path>
                    </g>
                  </svg>
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {error && <div className={styles.errorText}>{error}</div>}

      <div className={styles.actionsContainer}>
        <button
          type="button"
          onClick={addOption}
          disabled={options.length >= 4}
          className={styles.addButton}
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <g>
              <path d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"></path>
            </g>
          </svg>
          Add option
        </button>

        <select
          value={duration}
          onChange={(e) =>
            handleDurationChange(Number(e.target.value) as 1 | 3 | 7)
          }
          className={styles.durationSelect}
        >
          <option value={1}>1 day</option>
          <option value={3}>3 days</option>
          <option value={7}>7 days</option>
        </select>
      </div>
    </motion.div>
  );
};
