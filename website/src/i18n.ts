import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import esTranslations from './locales/es.json';
import enTranslations from './locales/en.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { ...enTranslations },
            es: { ...esTranslations },
        },
        fallbackLng: 'es',
        interpolation: {
            escapeValue: false, // react ya hace escapes de xss
        },
    });

export default i18n;
