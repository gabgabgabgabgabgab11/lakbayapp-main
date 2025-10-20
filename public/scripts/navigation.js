document.addEventListener("DOMContentLoaded", () => {
  const commuterBtn = document.getElementById("commuter-btn");
  const driverBtn = document.getElementById("driver-btn");

  if (commuterBtn) {
    commuterBtn.addEventListener("click", () => {
      console.log("Commuter button clicked!");
      window.location.href = "LoginPage.html";
    });
  }

  if (driverBtn) {
    driverBtn.addEventListener("click", () => {
      console.log("Driver button clicked!");
      window.location.href = "DriverHomepage.html";
    });
  }
});
