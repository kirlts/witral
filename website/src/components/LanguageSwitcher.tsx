import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export const LanguageSwitcher = () => {
    const { i18n } = useTranslation();

    const currentLanguage = i18n.language || 'es';

    const toggleLanguage = () => {
        const nextLang = currentLanguage.startsWith('es') ? 'en' : 'es';
        i18n.changeLanguage(nextLang);
    };

    return (
        <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors text-sm text-slate-600 hover:text-slate-900 shadow-sm"
            aria-label="Toggle language"
        >
            <Globe className="w-4 h-4" />
            <span className="uppercase font-medium tracking-wider">
                {currentLanguage.startsWith('es') ? 'ES' : 'EN'}
            </span>
        </button>
    );
};
