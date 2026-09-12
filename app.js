import "./app-core-v16.js";

const recommendationStyles = document.createElement("link");
recommendationStyles.rel = "stylesheet";
recommendationStyles.href = "./recommendations-v17.css";
document.head.appendChild(recommendationStyles);

const runtimeStyles = document.createElement("link");
runtimeStyles.rel = "stylesheet";
runtimeStyles.href = "./runtime-v18.css";
document.head.appendChild(runtimeStyles);

import "./recommendations-v17.js";
import "./runtime-v18.js";
