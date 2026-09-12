import "./app-core-v16.js";

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
onboardingStyles.href = "./onboarding-v19.css";
document.head.appendChild(onboardingStyles);

import "./recommendations-v17.js";
import "./runtime-v18.js";
import "./onboarding-v19.js";
import "./onboarding-mandatory-v193.js";
