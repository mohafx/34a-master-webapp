import React from 'react';

interface ProgressDotsProps {
    total: number;
    current: number;
    onDotClick?: (index: number) => void;
}

export default function ProgressDots({ total, current, onDotClick }: ProgressDotsProps) {
    return (
        <div className="flex justify-center items-center">
            {Array.from({ length: total }).map((_, index) => (
                <button
                    key={index}
                    onClick={() => onDotClick?.(index)}
                    disabled={!onDotClick}
                    className={`
                        p-2.5 focus:outline-none transition-colors
                        ${onDotClick ? 'cursor-pointer group' : 'cursor-default'}
                    `}
                    aria-label={`Screen ${index + 1} of ${total}`}
                >
                    <div
                        className={`
                            transition-all duration-300 rounded-full
                            ${index === current
                                ? 'w-8 h-2 bg-white'
                                : index < current
                                    ? 'w-2 h-2 bg-white/60 group-hover:bg-white/80'
                                    : 'w-2 h-2 bg-white/30 group-hover:bg-white/50'
                            }
                        `}
                    />
                </button>
            ))}
        </div>
    );
}
