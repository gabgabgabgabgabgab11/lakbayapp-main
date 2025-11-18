// RegistrationPage.js - replaced Font Awesome eye icon with inline SVG toggle button
const form = document.getElementById("register-form");
const formFields = document.querySelector(".form-fields");
const roleButtons = document.querySelectorAll(".role-btn");
const statusMessage = document.getElementById("status-message");

let selectedRole = "commuter";

// Predefined route options for drivers
const routeOptions = [
  "Sta Maria RiverBank - Norzagaray",
  "Sta Maria Wet Market - Norzagaray",
  "Sta Maria RiverBank - Muzon",
  "San Jose Del Monte - Manila",
  "Fairview - Quiapo",
  "Cubao - Novaliches"
];

// Predefined fleet managers
const fleetManagers = [
  "ABC Transport Cooperative",
  "XYZ Jeepney Association",
  "Metro Manila Transport Group",
  "Northern Luzon Operators",
  "Independent Operator"
];

// Role field configurations
const roleFields = {
  commuter: [
    { name: "name", label: "Full Name", type: "text", placeholder: "Juan Dela Cruz", required: true, pattern: "name" },
    { name: "email", label: "Email", type: "email", placeholder: "juan@example.com", required: true, pattern: "email" },
    { name: "password", label: "Password", type: "password", placeholder: "Min. 8 characters", required: true, pattern: "password" },
    { name: "confirmPassword", label: "Confirm Password", type: "password", placeholder: "Re-enter password", required: true, pattern: "password" }
  ],
  driver: [
    { name: "name", label: "Full Name", type: "text", placeholder: "Juan Dela Cruz", required: true, pattern: "name" },
    { name: "email", label: "Email", type: "email", placeholder: "driver@example.com", required: true, pattern: "email" },
    { name: "password", label: "Password", type: "password", placeholder: "Min. 8 characters", required: true, pattern: "password" },
    { name: "confirmPassword", label: "Confirm Password", type: "password", placeholder: "Re-enter password", required: true, pattern: "password" },
    { name: "plate", label: "Jeepney Plate Number", type: "text", placeholder: "ABC-1234", required: true, pattern: "plate" },
    { name: "route", label: "Route Name", type: "select", options: routeOptions, required: true },
    { name: "operator", label: "Fleet Manager", type: "select", options: fleetManagers, required: true }
  ],
  fleet: [
    { name: "name", label: "Full Name", type: "text", placeholder: "Juan Dela Cruz", required: true, pattern: "name" },
    { name: "email", label: "Email", type: "email", placeholder: "fleet@example.com", required: true, pattern: "email" },
    { name: "password", label: "Password", type: "password", placeholder: "Min. 8 characters", required: true, pattern: "password" },
    { name: "confirmPassword", label: "Confirm Password", type: "password", placeholder: "Re-enter password", required: true, pattern: "password" },
    { name: "fleetName", label: "Fleet / Company Name", type: "text", placeholder: "ABC Transport Corp", required: true, pattern: "company" },
    { name: "contact", label: "Contact Number", type: "tel", placeholder: "09XX-XXX-XXXX", required: true, pattern: "phone" },
    { name: "address", label: "Base Address", type: "text", placeholder: "123 Street, City", required: true }
  ]
};

// Validation patterns
const validationPatterns = {
  name: /^[a-zA-ZñÑ\s.'-]+$/,
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  password: /^.{8,32}$/,
  plate: /^[A-Z0-9]{2,3}-[A-Z0-9]{3,4}$/i,
  company: /^[a-zA-Z0-9\s.&'-]+$/,
  phone: /^(09|\+639)\d{9}$/
};

// Validation error messages
const validationMessages = {
  name: "Name can only contain letters, spaces, and common punctuation (. ' -)",
  email: "Please enter a valid email address (e.g., user@example.com)",
  password: "Password must be between 8 and 32 characters",
  passwordMatch: "Passwords do not match",
  plate: "Plate number format: ABC-1234 or AB-1234",
  company: "Company name can only contain letters, numbers, spaces, and & . ' -",
  phone: "Phone number must start with 09 or +639 and be 11-13 digits",
  required: "This field is required"
};

// --- Inline SVGs for eye / eye-slash (no external fonts) ---
const EYE_SVG = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2.47 12.39C3.98 7.86 7.61 5 12 5c4.39 0 8.02 2.86 9.53 7.39a1 1 0 0 1 0 .33C20.02 16.14 16.39 19 12 19c-4.39 0-8.02-2.86-9.53-7.39a1 1 0 0 1 0-.33z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const EYE_SLASH_SVG = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M3 3l18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M10.58 10.58A3 3 0 0 0 13.42 13.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M2.47 12.39C3.98 7.86 7.61 5 12 5c1.3 0 2.55.26 3.66.73" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M14.34 14.34C13.45 15.23 12.26 15.7 11 15.7c-1.3 0-2.55-.26-3.66-.73" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Utility to create a small button with the eye SVG
function makeEyeButton(fieldName) {
  const btn = document.createElement("button");
  btn.type = "button"; // avoid submitting the form
  btn.className = "toggle-password";
  btn.setAttribute("data-target", fieldName);
  btn.setAttribute("aria-label", "Toggle password visibility");
  btn.style.background = "transparent";
  btn.style.border = "none";
  btn.style.padding = "0";
  btn.style.marginLeft = "8px";
  btn.style.cursor = "pointer";
  btn.style.color = "rgba(255,255,255,0.9)";
  btn.innerHTML = EYE_SVG;
  btn.dataset.state = "hidden"; // hidden = password masked; visible = plaintext
  btn.addEventListener("click", () => togglePasswordVisibility(fieldName));
  return btn;
}

// Render form fields based on role
function renderFields(role) {
  formFields.innerHTML = "";
  roleFields[role].forEach(field => {
    const fieldWrapper = document.createElement("div");
    fieldWrapper.className = "form-group";

    const label = document.createElement("label");
    label.setAttribute("for", field.name);
    label.textContent = field.label;
    if (field.required) {
      label.innerHTML += ' <span class="required">*</span>';
    }

    let input;
    
    if (field.type === "select") {
      // Dropdown field
      input = document.createElement("select");
      input.id = field.name;
      input.name = field.name;
      input.required = field.required;
      
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = `-- Select ${field.label} --`;
      defaultOption.disabled = true;
      defaultOption.selected = true;
      input.appendChild(defaultOption);
      
      field.options.forEach(optionText => {
        const option = document.createElement("option");
        option.value = optionText;
        option.textContent = optionText;
        input.appendChild(option);
      });
    } else if (field.type === "password") {
      // Password field with eye icon
      const passwordWrapper = document.createElement("div");
      passwordWrapper.className = "password-wrapper";
      passwordWrapper.style.display = "flex";
      passwordWrapper.style.alignItems = "center";
      
      input = document.createElement("input");
      input.type = "password";
      input.id = field.name;
      input.name = field.name;
      input.placeholder = field.placeholder || "";
      input.required = field.required;
      input.minLength = 8;
      input.maxLength = 32;
      input.style.flex = "1";
      
      const eyeBtn = makeEyeButton(field.name);
      
      passwordWrapper.appendChild(input);
      passwordWrapper.appendChild(eyeBtn);
      
      fieldWrapper.appendChild(label);
      fieldWrapper.appendChild(passwordWrapper);
      
      const errorDiv = document.createElement("div");
      errorDiv.className = "error-message";
      errorDiv.id = `${field.name}-error`;
      fieldWrapper.appendChild(errorDiv);
      
      formFields.appendChild(fieldWrapper);
      
      // Add real-time validation
      input.addEventListener("input", () => validateField(input, field));
      input.addEventListener("blur", () => validateField(input, field));
      
      return;
    } else {
      // Regular input field
      input = document.createElement("input");
      input.type = field.type;
      input.id = field.name;
      input.name = field.name;
      input.placeholder = field.placeholder || "";
      input.required = field.required;
      
      if (field.type === "email") {
        input.autocomplete = "email";
      }
    }
    
    fieldWrapper.appendChild(label);
    fieldWrapper.appendChild(input);
    
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.id = `${field.name}-error`;
    fieldWrapper.appendChild(errorDiv);
    
    formFields.appendChild(fieldWrapper);
    
    // Add real-time validation for all fields
    input.addEventListener("input", () => validateField(input, field));
    input.addEventListener("blur", () => validateField(input, field));
  });
}

// Toggle password visibility
function togglePasswordVisibility(fieldName) {
  const input = document.getElementById(fieldName);
  const btn = document.querySelector(`[data-target="${fieldName}"]`);
  if (!input || !btn) return;

  if (input.type === "password") {
    input.type = "text";
    btn.innerHTML = EYE_SLASH_SVG;
    btn.dataset.state = "visible";
  } else {
    input.type = "password";
    btn.innerHTML = EYE_SVG;
    btn.dataset.state = "hidden";
  }
}

// Validate individual field
function validateField(input, field) {
  const value = input.value.trim();
  const errorDiv = document.getElementById(`${field.name}-error`);
  
  // Clear previous error
  errorDiv.textContent = "";
  input.classList.remove("input-error");
  
  // Check if required and empty
  if (field.required && !value) {
    if (input === document.activeElement || value === "") {
      // Only show required error on blur or submit
      return false;
    }
  }
  
  // Validate pattern
  if (value && field.pattern && validationPatterns[field.pattern]) {
    if (!validationPatterns[field.pattern].test(value)) {
      errorDiv.textContent = validationMessages[field.pattern];
      input.classList.add("input-error");
      return false;
    }
  }
  
  // Validate password match
  if (field.name === "confirmPassword") {
    const password = document.getElementById("password").value;
    if (value && value !== password) {
      errorDiv.textContent = validationMessages.passwordMatch;
      input.classList.add("input-error");
      return false;
    }
  }
  
  // Success
  input.classList.remove("input-error");
  return true;
}

// Validate all fields
function validateAllFields() {
  const fields = Array.from(formFields.querySelectorAll("input, select"));
  let isValid = true;
  
  fields.forEach(input => {
    const fieldName = input.name;
    const fieldConfig = roleFields[selectedRole].find(f => f.name === fieldName);
    
    if (!fieldConfig) return;
    
    const errorDiv = document.getElementById(`${fieldName}-error`);
    const value = input.value.trim();
    
    // Clear previous error
    errorDiv.textContent = "";
    input.classList.remove("input-error");
    
    // Check required
    if (fieldConfig.required && !value) {
      errorDiv.textContent = validationMessages.required;
      input.classList.add("input-error");
      isValid = false;
      return;
    }
    
    // Validate pattern
    if (value && fieldConfig.pattern && validationPatterns[fieldConfig.pattern]) {
      if (!validationPatterns[fieldConfig.pattern].test(value)) {
        errorDiv.textContent = validationMessages[fieldConfig.pattern];
        input.classList.add("input-error");
        isValid = false;
        return;
      }
    }
    
    // Password match
    if (fieldName === "confirmPassword") {
      const password = document.getElementById("password").value;
      if (value !== password) {
        errorDiv.textContent = validationMessages.passwordMatch;
        input.classList.add("input-error");
        isValid = false;
      }
    }
  });
  
  return isValid;
}

// Initialize with commuter fields
renderFields(selectedRole);

// Handle role switch
roleButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    roleButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedRole = btn.dataset.role;
    renderFields(selectedRole);
    statusMessage.textContent = "";
  });
});

// Handle registration
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // Validate all fields
  if (!validateAllFields()) {
    statusMessage.textContent = "Please fix the errors above";
    statusMessage.style.color = "#ff4444";
    return;
  }
  
  const data = Object.fromEntries(new FormData(form).entries());
  
  // Remove confirmPassword before sending to server
  delete data.confirmPassword;

  statusMessage.textContent = "Registering...";
  statusMessage.style.color = "#ffc300";

  try {
    const res = await fetch(`/api/register/${selectedRole}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok) {
      statusMessage.textContent = "✓ " + result.message + " Redirecting to login...";
      statusMessage.style.color = "#4caf50";
      form.reset();
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = `LoginPage.html?role=${selectedRole}`;
      }, 2000);
    } else {
      statusMessage.textContent = "✗ " + result.message;
      statusMessage.style.color = "#ff4444";
    }
  } catch (error) {
    console.error("Registration error:", error);
    statusMessage.textContent = "✗ Server error. Please try again later.";
    statusMessage.style.color = "#ff4444";
  }
});