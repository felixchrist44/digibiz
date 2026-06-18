const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://aggylidubfmpjdyxspah.supabase.co';
const supabaseKey = 'sb_publishable_PPZc1--_ZBELKtKuC-XMXA_STKuiR3H';

async function runTest() {
  console.log('🚀 Starting Multi-Tenant Realtime WebSocket Isolation Test...');

  const clientA = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
  
  const clientB = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  // 1. Authenticate User A
  console.log('🔑 Logging in User A (master@digibiz.com)...');
  let authA = await clientA.auth.signInWithPassword({
    email: 'master@digibiz.com',
    password: 'password123'
  });

  if (authA.error) {
    console.error('❌ User A Login Failed:', authA.error.message);
    return;
  }
  const userA = authA.data.user;
  console.log(`✅ User A Logged In. ID: ${userA.id}`);

  // Fetch Profile A to get tenant_id
  let { data: profileA, error: errProfileA } = await clientA
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', userA.id)
    .single();

  if (errProfileA || !profileA) {
    console.error('❌ Failed to fetch Profile A:', errProfileA?.message);
    return;
  }
  console.log(`🏢 User A Tenant ID: ${profileA.tenant_id} (Role: ${profileA.role})`);

  // 2. Authenticate or Sign Up User B
  console.log('🔑 Attempting to sign up User B (toko-b@digibiz.com)...');
  let signUpB = await clientB.auth.signUp({
    email: 'toko-b@digibiz.com',
    password: 'password123',
    options: {
      data: {
        full_name: 'Toko B Owner',
        role: 'owner',
        nama_toko: 'Toko B'
      }
    }
  });

  let userB;
  if (signUpB.error) {
    if (signUpB.error.message.includes('already registered') || signUpB.error.message.includes('User already exists')) {
      console.log('ℹ️ User B already registered. Logging in instead...');
      let authB = await clientB.auth.signInWithPassword({
        email: 'toko-b@digibiz.com',
        password: 'password123'
      });
      if (authB.error) {
        console.error('❌ User B Login Failed:', authB.error.message);
        return;
      }
      userB = authB.data.user;
    } else {
      console.error('❌ User B Signup Failed:', signUpB.error.message);
      return;
    }
  } else {
    userB = signUpB.data.user;
    console.log('✅ User B Registered successfully.');
  }
  console.log(`✅ User B Logged In. ID: ${userB.id}`);

  // Fetch Profile B to get tenant_id
  let { data: profileB, error: errProfileB } = await clientB
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', userB.id)
    .single();

  if (errProfileB || !profileB) {
    console.error('❌ Failed to fetch Profile B:', errProfileB?.message);
    return;
  }
  console.log(`🏢 User B Tenant ID: ${profileB.tenant_id} (Role: ${profileB.role})`);

  // Assert tenant IDs are different
  if (profileA.tenant_id === profileB.tenant_id) {
    console.error('❌ Error: Tenant IDs are identical! Test cannot prove isolation.');
    return;
  }
  console.log('🛡️ Multi-tenancy confirmed: Tenant IDs are isolated and different!');

  // 3. Establish Channel Connections
  const channelNameA = `inventory-checkout-${profileA.tenant_id}`;
  const channelNameB = `inventory-checkout-${profileB.tenant_id}`;

  console.log(`🔌 Connecting User A to channel: ${channelNameA}`);
  let receivedByA = [];
  const chanA = clientA.channel(channelNameA, { config: { broadcast: { self: false }, private: true } });
  chanA.on('broadcast', { event: 'barcode-scanned' }, (payload) => {
    console.log('⚠️ USER A RECEIVED SCAN EVENT:', payload);
    receivedByA.push(payload);
  });

  await new Promise((resolve) => {
    chanA.subscribe((status) => {
      console.log(`  > User A subscription status: ${status}`);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  console.log(`🔌 Connecting User B to channel: ${channelNameB}`);
  let receivedByB = [];
  const chanB = clientB.channel(channelNameB, { config: { broadcast: { self: false, ack: true }, private: true } });
  chanB.on('broadcast', { event: 'barcode-scanned' }, (payload) => {
    console.log('🎯 USER B RECEIVED SCAN EVENT:', payload);
    receivedByB.push(payload);
  });

  await new Promise((resolve) => {
    chanB.subscribe((status) => {
      console.log(`  > User B subscription status: ${status}`);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  // 4. Test Isolation: Broadcast from B, check if A receives it
  console.log('📤 User B broadcasting scan (SKU: "8991234567890") on User B\'s channel...');
  chanB.send({
    type: 'broadcast',
    event: 'barcode-scanned',
    payload: { sku: '8991234567890' }
  });

  console.log('⏳ Waiting 3 seconds for broadcast replication...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('📊 Checking Received Events:');
  console.log(`  - User A received count: ${receivedByA.length}`);
  console.log(`  - User B received count: ${receivedByB.length} (should be 0 since self: false)`);

  if (receivedByA.length === 0) {
    console.log('✅ SUCCESS: User A did NOT receive User B\'s broadcast! Channel isolation verified.');
  } else {
    console.error('❌ FAILURE: User A received User B\'s broadcast! Cross-tenant broadcast leakage detected.');
  }

  // 5. Test Delivery: Join Client B's scanner to channel B, check if a separate client B's checkout receives it
  console.log('🔌 Creating a separate Checkout Client B for User B to verify delivery...');
  const checkoutClientB = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
  await checkoutClientB.auth.signInWithPassword({
    email: 'toko-b@digibiz.com',
    password: 'password123'
  });

  let checkoutBReceived = [];
  const checkoutChanB = checkoutClientB.channel(channelNameB, { config: { broadcast: { self: false }, private: true } });
  checkoutChanB.on('broadcast', { event: 'barcode-scanned' }, (payload) => {
    console.log('🎯 CHECKOUT B RECEIVED EVENT:', payload);
    checkoutBReceived.push(payload);
  });

  await new Promise((resolve) => {
    checkoutChanB.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  console.log('📤 User B broadcasting scan (SKU: "8992761001111") on User B\'s channel...');
  chanB.send({
    type: 'broadcast',
    event: 'barcode-scanned',
    payload: { sku: '8992761001111' }
  });

  console.log('⏳ Waiting 2 seconds for broadcast replication...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`  - Checkout Client B received count: ${checkoutBReceived.length}`);
  if (checkoutBReceived.length === 1 && checkoutBReceived[0].payload.sku === '8992761001111') {
    console.log('✅ SUCCESS: Checkout Client B received the scan event successfully! Delivery verified.');
  } else {
    console.error('❌ FAILURE: Checkout Client B did not receive the event correctly.');
  }

  // Clean up
  await chanA.unsubscribe();
  await chanB.unsubscribe();
  await checkoutChanB.unsubscribe();
  console.log('🏁 WebSocket Isolation Test Finished.');
}

runTest();
