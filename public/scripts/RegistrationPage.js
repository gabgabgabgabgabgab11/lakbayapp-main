const form = document.getElementById("register-form");
const formFields = document.querySelector(".form-fields");
const roleButtons = document.querySelectorAll(".role-btn");
const statusMessage = document.getElementById("status-message");

let selectedRole = "commuter";

// Role field configurations
const roleFields = {
  commuter: [
    { name: "name", label: "Full Name" },
    { name: "email", label: "Email", type: "email" },
    { name: "password", label: "Password", type: "password" },
    { name: "confirmPassword", label: "Confirm Password", type: "password" }
  ],
  driver: [
    { name: "name", label: "Full Name" },
    { name: "email", label: "Email", type: "email" },
    { name: "password", label: "Password", type: "password" },
    { name: "plate", label: "Jeepney Plate Number" },
    { name: "route", label: "Route Name" },
    { name: "operator", label: "Operator / Fleet Manager" }
  ],
  fleet: [
    { name: "name", label: "Full Name" },
    { name: "email", label: "Email", type: "email" },
    { name: "password", label: "Password", type: "password" },
    { name: "fleetName", label: "Fleet / Company Name" },
    { name: "contact", label: "Contact Number" },
    { name: "address", label: "Base Address" }
  ]
};

const accountTypeMap = {
  commuter: 1,
  driver: 2,
  fleet: 3
};


// Render form fields based on role
function renderFields(role) {
  formFields.innerHTML = "";
  roleFields[role].forEach(field => {
    const inputType = field.type || "text";
    formFields.innerHTML += `
      <label for="${field.name}">${field.label}</label>
      <input type="${inputType}" id="${field.name}" name="${field.name}" required>
    `;
  });
}

renderFields(selectedRole);

// Handle role switch
roleButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    roleButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedRole = btn.dataset.role;
    renderFields(selectedRole);
  });
});

// Handle registration
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    const res = await fetch(`/api/register/${selectedRole}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    statusMessage.textContent = result.message;

    if (res.ok) {
      statusMessage.style.color = "#90EE90";
      form.reset();
    } else {
      statusMessage.style.color = "#FFD700";
    }
  } catch (error) {
    statusMessage.textContent = "Server error. Try again later.";
    statusMessage.style.color = "#FFD700";
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  data.AccountType = accountTypeMap[selectedRole]; // Assign AccountType

  try {
    const res = await fetch(`/api/register/${selectedRole}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    statusMessage.textContent = result.message;

    if (res.ok) {
      statusMessage.style.color = "#90EE90";
      form.reset();
    } else {
      statusMessage.style.color = "#FFD700";
    }
  } catch (error) {
    statusMessage.textContent = "Server error. Try again later.";
    statusMessage.style.color = "#FFD700";
  }
});