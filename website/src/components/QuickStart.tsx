import { motion } from "framer-motion";
import { Terminal, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function QuickStart() {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const command = "git clone https://github.com/kirlts/witral.git\ncd witral\nchmod +x scripts/start.sh\n./scripts/start.sh";

    const handleCopy = () => {
        navigator.clipboard.writeText(command);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <section className="relative w-full py-12 md:py-16 flex flex-col items-center justify-center px-4 overflow-hidden">
            {/* Soft Background */}
            <div className="absolute inset-0 bg-white pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="text-center mb-8 max-w-3xl mx-auto z-10"
            >
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                    {t('quickstart.title')}
                </h2>
                <p className="text-lg md:text-xl text-slate-600 mx-auto font-light">
                    {t('quickstart.subtitle')}
                </p>
            </motion.div>

            {/* macOS Style Terminal Snippet */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="w-full max-w-2xl z-10"
            >
                <div className="bg-slate-900 rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden border border-slate-800">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500/80" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                            <div className="w-3 h-3 rounded-full bg-green-500/80" />
                        </div>
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                            <Terminal className="w-4 h-4" />
                            <span>Quick Start</span>
                        </div>
                        <button
                            onClick={handleCopy}
                            className="text-slate-400 hover:text-white transition-colors"
                            aria-label="Copy to clipboard"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 relative">
                        <pre className="font-mono text-sm leading-relaxed text-emerald-400/90 whitespace-pre-wrap">
                            {command}
                        </pre>

                        {/* Copied Toast */}
                        <div className={`absolute top-4 right-4 bg-emerald-500 text-white text-xs px-2 py-1 rounded shadow-lg transition-opacity ${copied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            {t('quickstart.copied')}
                        </div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
