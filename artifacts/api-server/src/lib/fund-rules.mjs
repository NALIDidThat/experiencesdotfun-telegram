export function canLaunchCharityFund(userType, organisationType) {
  return userType === "organisation" && organisationType === "charity";
}
