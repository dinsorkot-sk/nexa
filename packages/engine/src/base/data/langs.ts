/**
 * Languages offered by the base module, one per line:
 * `code|ISO code|name|direction|date format|time format|decimal point|thousands separator|week start (1=Mon..7=Sun)`.
 * Only en_US is active after installation; the others are activated on demand.
 * Formats use strftime-style directives.
 */
export const LANGS_CSV = `en_US|en|English (US)|ltr|%m/%d/%Y|%H:%M:%S|.|,|7
en_GB|en_GB|English (UK)|ltr|%d/%m/%Y|%H:%M:%S|.|,|1
th_TH|th|Thai / ภาษาไทย|ltr|%d/%m/%Y|%H:%M:%S|.|,|7
fr_FR|fr|French / Français|ltr|%d/%m/%Y|%H:%M:%S|,| |1
de_DE|de|German / Deutsch|ltr|%d.%m.%Y|%H:%M:%S|,|.|1
es_ES|es|Spanish / Español|ltr|%d/%m/%Y|%H:%M:%S|,|.|1
it_IT|it|Italian / Italiano|ltr|%d/%m/%Y|%H:%M:%S|,|.|1
pt_BR|pt_BR|Portuguese (BR) / Português (BR)|ltr|%d/%m/%Y|%H:%M:%S|,|.|7
nl_NL|nl|Dutch / Nederlands|ltr|%d-%m-%Y|%H:%M:%S|,|.|1
ru_RU|ru|Russian / русский язык|ltr|%d.%m.%Y|%H:%M:%S|,| |1
ja_JP|ja|Japanese / 日本語|ltr|%Y/%m/%d|%H:%M:%S|.|,|7
zh_CN|zh_CN|Chinese (Simplified) / 简体中文|ltr|%Y-%m-%d|%H:%M:%S|.|,|1
zh_TW|zh_TW|Chinese (Traditional) / 繁體中文|ltr|%Y/%m/%d|%H:%M:%S|.|,|7
ko_KR|ko_KR|Korean / 한국어|ltr|%Y-%m-%d|%H:%M:%S|.|,|7
vi_VN|vi|Vietnamese / Tiếng Việt|ltr|%d/%m/%Y|%H:%M:%S|,|.|1
id_ID|id|Indonesian / Bahasa Indonesia|ltr|%d/%m/%Y|%H:%M:%S|,|.|1
ar_001|ar|Arabic / الْعَرَبيّة|rtl|%d/%m/%Y|%H:%M:%S|.|,|6
he_IL|he|Hebrew / עברית|rtl|%d/%m/%Y|%H:%M:%S|.|,|7`;
