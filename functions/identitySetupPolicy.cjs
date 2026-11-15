// Shared with Identity Center's existing login response. No new PIN/password
// rule is introduced here; incomplete setup is not an activated workspace.
const requiresIdentitySetup = identity => Boolean(!identity||identity.requiresPasswordChange
 || !identity.setup?.pinSet || !identity.setup?.trustedDevice);
module.exports={requiresIdentitySetup};
