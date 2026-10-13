# vendor

Third-party files the app needs, kept here so it runs with no network.

| Folder | What | Version | Licence |
|---|---|---|---|
| phosphor/ | Phosphor Icons web font (regular weight) | @phosphor-icons/web 2.1.1 | MIT |
| fonts/ | Inter and JetBrains Mono, latin subset, weights 400-700 | @fontsource/inter 5.0.18, @fontsource/jetbrains-mono 5.0.20 | SIL Open Font License 1.1 |
| jspdf/ | jsPDF, used to make the quotation PDF | 2.5.1 | MIT |

To update one, replace the files from the same package and check that tests/run.py still passes (its static checks refuse any web address in index.html).
