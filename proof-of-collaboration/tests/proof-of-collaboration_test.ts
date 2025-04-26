import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure that contract initializes correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;

        let block = chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'initialize', [], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Check if deployer is admin
        const isAdmin = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'is-project-admin',
            [types.principal(deployer.address)],
            deployer.address
        );
        assertEquals(isAdmin.result, 'true');
    },
});

Clarinet.test({
    name: "Ensure that only contract owner can add project admins",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;

        // Initialize contract
        chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'initialize', [], deployer.address)
        ]);

        // Test adding admin as contract owner
        let block = chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'add-project-admin', [types.principal(user1.address)], deployer.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify admin was added
        const isAdmin = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'is-project-admin',
            [types.principal(user1.address)],
            deployer.address
        );
        assertEquals(isAdmin.result, 'true');

        // Test adding admin as non-owner (should fail)
        block = chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'add-project-admin', [types.principal(user2.address)], user1.address)
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only
    },
});

Clarinet.test({
    name: "Ensure that users can submit contributions",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize contract
        chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'initialize', [], deployer.address)
        ]);

        // Submit contribution
        let block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'submit-contribution',
                [types.utf8('Created documentation for API endpoints')],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok u1)'); // First contribution ID

        // Check contribution details
        const contribution = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contribution',
            [types.uint(1)],
            user1.address
        );

        const contributionData = contribution.result.replace('(some ', '').slice(0, -1);
        assertEquals(contributionData.includes(user1.address), true);
        assertEquals(contributionData.includes('Created documentation for API endpoints'), true);
        assertEquals(contributionData.includes('verified: false'), true);

        // Check contributor profile
        const profile = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-profile',
            [types.principal(user1.address)],
            user1.address
        );

        const profileData = profile.result.replace('(some ', '').slice(0, -1);
        assertEquals(profileData.includes('contribution-count: u1'), true);
        assertEquals(profileData.includes('tier: u1'), true); // BRONZE
        assertEquals(profileData.includes('total-score: u0'), true);
    },
});

Clarinet.test({
    name: "Ensure that only project admins can verify contributions",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;

        // Initialize contract
        chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'initialize', [], deployer.address)
        ]);

        // Submit contribution
        chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'submit-contribution',
                [types.utf8('Fixed critical security bug')],
                user1.address
            )
        ]);

        // Try to verify as non-admin (should fail)
        let block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(1), types.uint(100)],
                user2.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // err-owner-only

        // Verify as admin
        block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(1), types.uint(100)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Check that contribution is now verified
        const contribution = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contribution',
            [types.uint(1)],
            deployer.address
        );

        const contributionData = contribution.result.replace('(some ', '').slice(0, -1);
        assertEquals(contributionData.includes('verified: true'), true);
        assertEquals(contributionData.includes('score: u100'), true);

        // Check that contributor score is updated
        const profile = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-profile',
            [types.principal(user1.address)],
            deployer.address
        );

        const profileData = profile.result.replace('(some ', '').slice(0, -1);
        assertEquals(profileData.includes('total-score: u100'), true);
    },
});

Clarinet.test({
    name: "Ensure that contributions cannot be verified twice",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize contract
        chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'initialize', [], deployer.address)
        ]);

        // Submit contribution
        chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'submit-contribution',
                [types.utf8('Built automated test suite')],
                user1.address
            )
        ]);

        // Verify contribution
        chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(1), types.uint(75)],
                deployer.address
            )
        ]);

        // Try to verify again (should fail)
        let block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(1), types.uint(100)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // err-already-verified
    },
});

Clarinet.test({
    name: "Ensure that contributor tiers update correctly based on score thresholds",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize contract
        chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'initialize', [], deployer.address)
        ]);

        // Submit multiple contributions
        for (let i = 0; i < 3; i++)
        {
            chain.mineBlock([
                Tx.contractCall(
                    'proof-of-collaboration',
                    'submit-contribution',
                    [types.utf8(`Contribution ${i + 1}`)],
                    user1.address
                )
            ]);
        }

        // Verify with different scores
        chain.mineBlock([
            // First contribution - 50 points
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(1), types.uint(50)],
                deployer.address
            )
        ]);

        // Check tier - should still be BRONZE (below SILVER threshold)
        let block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'update-contributor-tier',
                [types.principal(user1.address)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        let tierCheck = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-tier',
            [types.principal(user1.address)],
            deployer.address
        );
        assertEquals(tierCheck.result, '(ok u1)'); // BRONZE

        // Second contribution - 75 points (total: 125)
        chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(2), types.uint(75)],
                deployer.address
            )
        ]);

        // Update and check tier - should now be SILVER
        block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'update-contributor-tier',
                [types.principal(user1.address)],
                deployer.address
            )
        ]);

        tierCheck = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-tier',
            [types.principal(user1.address)],
            deployer.address
        );
        assertEquals(tierCheck.result, '(ok u2)'); // SILVER

        // Third contribution - 200 points (total: 325)
        chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(3), types.uint(200)],
                deployer.address
            )
        ]);

        // Update and check tier - should now be GOLD
        block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'update-contributor-tier',
                [types.principal(user1.address)],
                deployer.address
            )
        ]);

        tierCheck = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-tier',
            [types.principal(user1.address)],
            deployer.address
        );
        assertEquals(tierCheck.result, '(ok u3)'); // GOLD

        // Submit one more huge contribution to test PLATINUM
        chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'submit-contribution',
                [types.utf8('Major contribution')],
                user1.address
            )
        ]);

        chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(4), types.uint(200)],
                deployer.address
            )
        ]);

        // Update and check tier - should now be PLATINUM (total: 525)
        block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'update-contributor-tier',
                [types.principal(user1.address)],
                deployer.address
            )
        ]);

        tierCheck = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-tier',
            [types.principal(user1.address)],
            deployer.address
        );
        assertEquals(tierCheck.result, '(ok u4)'); // PLATINUM
    },
});

Clarinet.test({
    name: "Ensure that non-existent contribution and contributor queries are handled correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;

        // Initialize contract
        chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'initialize', [], deployer.address)
        ]);

        // Try to get non-existent contribution
        const contribution = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contribution',
            [types.uint(999)],
            deployer.address
        );

        assertEquals(contribution.result, 'none');

        // Try to get non-existent contributor profile
        const profile = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-profile',
            [types.principal(user1.address)],
            deployer.address
        );

        assertEquals(profile.result, 'none');

        // Try to get tier for non-existent contributor
        const tier = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-tier',
            [types.principal(user1.address)],
            deployer.address
        );

        assertEquals(tier.result, '(err u101)'); // err-not-found
    },
});

Clarinet.test({
    name: "Ensure multiple users can submit contributions and be verified correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;

        // Initialize contract
        chain.mineBlock([
            Tx.contractCall('proof-of-collaboration', 'initialize', [], deployer.address)
        ]);

        // Submit contributions from both users
        let block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'submit-contribution',
                [types.utf8('User 1 contribution')],
                user1.address
            ),
            Tx.contractCall(
                'proof-of-collaboration',
                'submit-contribution',
                [types.utf8('User 2 contribution')],
                user2.address
            )
        ]);

        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result, '(ok u1)');
        assertEquals(block.receipts[1].result, '(ok u2)');

        // Verify both contributions
        block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(1), types.uint(75)],
                deployer.address
            ),
            Tx.contractCall(
                'proof-of-collaboration',
                'verify-contribution',
                [types.uint(2), types.uint(120)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result, '(ok true)');
        assertEquals(block.receipts[1].result, '(ok true)');

        // Update and check tiers
        block = chain.mineBlock([
            Tx.contractCall(
                'proof-of-collaboration',
                'update-contributor-tier',
                [types.principal(user1.address)],
                deployer.address
            ),
            Tx.contractCall(
                'proof-of-collaboration',
                'update-contributor-tier',
                [types.principal(user2.address)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 2);

        // User 1 should be BRONZE (score 75)
        let user1Tier = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-tier',
            [types.principal(user1.address)],
            deployer.address
        );
        assertEquals(user1Tier.result, '(ok u1)');

        // User 2 should be SILVER (score 120)
        let user2Tier = chain.callReadOnlyFn(
            'proof-of-collaboration',
            'get-contributor-tier',
            [types.principal(user2.address)],
            deployer.address
        );
        assertEquals(user2Tier.result, '(ok u2)');
    },
});