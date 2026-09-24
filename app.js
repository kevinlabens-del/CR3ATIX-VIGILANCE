import "./app-core-v16.js";
import "./stability-v21.js";

// CR3@TIX ANALYTIX — project tracker for CREATIX VIGILANCE.
// Loaded dynamically so analytics can never block or break the host application.
const analytixTracker = document.createElement("script");
analytixTracker.async = true;
analytixTracker.src = "https://kevinlabens-del.github.io/CR3-TIX-ANALYTIX./analytics.js";
analytixTracker.dataset.projectId = "433cecda-28e1-46e4-91e3-32a0d5a3baf7";
analytixTracker.dataset.projectKey = "987d95de-55bc-4483-ba51-4e19753f59b0";
document.head.appendChild(analytixTracker);

// Useful product events automatically collected by the ANALYTIX delegated click tracker.
[
  ["startBtn", "vigilance_start"],
  ["stopBtn", "vigilance_stop"],
  ["calibrateBtn", "calibration_start"],
  ["settingsBtn", "settings_open"],
  ["installBtn", "install_prompt"]
].forEach(([id, eventName]) => {
  const element = document.getElementById(id);
  if (element) element.dataset.analyticsEvent = eventName;
});

const recommendationStyles = document.createElement("link");
recommendationStyles.rel = "stylesheet";
recommendationStyles.href = "./recommendations-v17.css";
document.head.appendChild(recommendationStyles);

const runtimeStyles = document.createElement("link");
runtimeStyles.rel = "stylesheet";
runtimeStyles.href = "./runtime-v18.css";
document.head.appendChild(runtimeStyles);

const onboardingStyles = document.createElement("link");
onboardingStyles.rel = "stylesheet";
onboardingStyles.href = "./onboarding-v20.css?v=200";
document.head.appendChild(onboardingStyles);

import "./recommendations-v17.js";
import "./runtime-v18.js";
import "./onboarding-v200.js";


/* CR3ATIX_SHARE_V1 — partage volontaire hors de la zone de conduite active. */
const shareButton = document.getElementById("shareAppBtn");
const shareStatus = document.getElementById("shareAppStatus");
if (shareButton) {
  const canonicalUrl = "https://kevinlabens-del.github.io/CR3ATIX-VIGILANCE/";
  const setShareStatus = (message) => {
    if (shareStatus) shareStatus.textContent = message;
  };
  const copyShareUrl = async () => {
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(canonicalUrl);
        setShareStatus("Lien de l’application copié.");
        return;
      }
    } catch {}
    const field = document.createElement("textarea");
    field.value = canonicalUrl;
    field.readOnly = true;
    field.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
    document.body.append(field);
    field.select();
    field.setSelectionRange(0, field.value.length);
    let copied = false;
    try { copied = document.execCommand("copy"); } catch {}
    field.remove();
    if (copied) setShareStatus("Lien de l’application copié.");
    else window.prompt("Copie ce lien pour partager CR3@TIX VIGILANCE :", canonicalUrl);
  };
  shareButton.addEventListener("click", async () => {
    const data = {
      title: "CR3@TIX VIGILANCE",
      text: "Découvre CR3@TIX VIGILANCE, une application d’aide à la vigilance pour conducteurs.",
      url: canonicalUrl
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
        setShareStatus("Partage ouvert sur ton appareil.");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    await copyShareUrl();
  });
}
