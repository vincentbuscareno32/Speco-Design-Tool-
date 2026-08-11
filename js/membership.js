// Shared between apply.html and login.html. Idempotent — safe to call on every
// authenticated page load. If a dealer_members row already exists for this user,
// does nothing. Otherwise, if signup metadata recorded an intended company (set by
// apply.html), creates the pending membership now. This covers both the immediate-
// session apply case AND the deferred-email-confirmation case, since it also runs
// at the top of login.html's routing check on someone's first real sign-in.
async function ensureMembership(sb, user){
  const { data: existing } = await sb.from('dealer_members').select('id').eq('user_id', user.id).limit(1);
  if(existing && existing.length > 0) return; // already has a membership row

  const meta = user.user_metadata || {};
  const company = meta.pending_company;
  const fullName = meta.pending_full_name;
  if(!company) return; // no application intent recorded — e.g. an account created manually

  const domain = (user.email || '').split('@')[1] || null;

  let dealerId = null;
  if(domain){
    // Matches an existing dealer (pending or active) by domain, so a second person
    // from an already-applied-but-not-yet-approved company lands under the same
    // dealer instead of accidentally spawning a duplicate.
    const { data: matches } = await sb.from('dealers').select('id').eq('domain', domain).limit(1);
    if(matches && matches.length > 0) dealerId = matches[0].id;
  }

  let role = 'individual_user';
  if(!dealerId){
    // No dealer matches this domain — propose a brand new one, landing as pending
    // like everything else. Whoever founds a new dealer becomes its first admin so
    // someone can manage the team once approved.
    const { data: newDealer, error: dealerErr } = await sb.from('dealers')
      .insert({ name: company, domain: domain, status: 'pending' })
      .select('id').single();
    if(dealerErr || !newDealer) return; // can't proceed without a dealer to attach to
    dealerId = newDealer.id;
    role = 'partner_admin';
  }

  await sb.from('dealer_members').insert({
    dealer_id: dealerId, user_id: user.id, full_name: fullName, email: user.email,
    role, status: 'pending'
  });
}
