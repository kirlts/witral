import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const commands = [
    { text: ",,idea Rewrite the ingestor logic", delay: 1000 },
    { text: "File 'Rewrite the ingestor logic.md' created in vault/tags/idea 🚀", delay: 2000, isSystem: true },
    { text: ",,todo Fix the parsing issue,,Critical", delay: 4000 },
    { text: "Task appended to 'Critical.md' in vault/tags/todo ✅", delay: 5000, isSystem: true },
];

export function TerminalSimulator() {
    const [lines, setLines] = useState<typeof commands>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex < commands.length) {
            const timer = setTimeout(() => {
                setLines((prev) => [...prev, commands[currentIndex]]);
                setCurrentIndex((prev) => prev + 1);
            }, commands[currentIndex].delay - (currentIndex > 0 ? commands[currentIndex - 1].delay : 0));
            return () => clearTimeout(timer);
        } else {
            const loop = setTimeout(() => {
                setLines([]);
                setCurrentIndex(0);
            }, 5000); // Loop after 5s
            return () => clearTimeout(loop);
        }
    }, [currentIndex]);

    return (
        <div className="w-full max-w-2xl mx-auto rounded-xl overflow-hidden border border-white/10 bg-black/60 backdrop-blur-xl shadow-2xl relative isolated">
            {/* Header macOS style */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-xs font-medium text-white/40 tracking-wider">witral ~ chat</span>
            </div>

            {/* Terminal Body */}
            <div className="p-6 font-mono text-sm sm:text-base min-h-[220px] flex flex-col justify-end">
                <AnimatePresence mode="popLayout">
                    {lines.map((line, i) => (
                        <motion.div
                            layout
                            key={i}
                            initial={{ opacity: 0, x: -10, filter: "blur(4px)" }}
                            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, filter: "blur(4px)" }}
                            transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 30,
                                mass: 0.8
                            }}
                            className={`mb-3 flex items-start ${line.isSystem ? "text-green-400" : "text-white"
                                }`}
                        >
                            {!line.isSystem && (
                                <span className="mr-3 text-primary/70 select-none">❯</span>
                            )}
                            {line.isSystem && (
                                <span className="mr-3 text-green-400/50 select-none">⚙</span>
                            )}
                            <span className="leading-relaxed opacity-90 tracking-tight">
                                {line.text}
                            </span>
                        </motion.div>
                    ))}

                    {/* Cursor */}
                    <motion.div
                        layout
                        key="cursor"
                        className="flex items-center text-white/60 mt-1"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                        <span className="mr-3 text-primary/70">❯</span>
                        <motion.div
                            animate={{ opacity: [1, 0] }}
                            transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                            className="w-2 h-5 bg-white/70"
                        />
                    </motion.div>
                </AnimatePresence>
            </div>

        </div>
    );
}
