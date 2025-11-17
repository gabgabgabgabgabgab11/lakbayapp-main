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
      
      input = document.createElement("input");
      input.type = "password";
      input.id = field.name;
      input.name = field.name;
      input.placeholder = field.placeholder || "";
      input.required = field.required;
      input.minLength = 8;
      input.maxLength = 32;
      
      const eyeIcon = document.createElement("i");
      eyeIcon.className = "fas fa-eye toggle-password";
      eyeIcon.setAttribute("data-target", field.name);
      
      passwordWrapper.appendChild(input);
      passwordWrapper.appendChild(eyeIcon);
      
      fieldWrapper.appendChild(label);
      fieldWrapper.appendChild(passwordWrapper);
      
      const errorDiv = document.createElement("div");
      errorDiv.className = "error-message";
      errorDiv.id = `${field.name}-error`;
      fieldWrapper.appendChild(errorDiv);
      
      formFields.appendChild(fieldWrapper);
      
      // Add event listener for eye icon
      eyeIcon.addEventListener("click", () => togglePasswordVisibility(field.name));
      
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
  const icon = document.querySelector(`[data-target="${fieldName}"]`);
  
  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
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