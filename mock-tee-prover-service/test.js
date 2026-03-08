const check = async () => {
    try {
        const fetchRes = await fetch('http://localhost:3000/api/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chequeId: '0x1eb8bad16917cfb18d2ee22b936c7e52ad3fee2388a872a7418aee3992de0086',
                recipientAddress: '0x7F248511D4e51a9f3ded64AaC7771Cd6ffb6360E',
                targetChainId: 11155420
            })
        });
        const json = await fetchRes.json();
        console.log("Redeem Response:", json);

        // Wait a bit for the background job to finish
        setTimeout(async () => {
            const getRes = await fetch('http://localhost:3000/api/verifications/0x1eb8bad16917cfb18d2ee22b936c7e52ad3fee2388a872a7418aee3992de0086');
            console.log("Get status:", getRes.status);
            const getJson = await getRes.json();
            console.log("Get Response:", getJson);
        }, 5000);
    } catch (e) {
        console.error(e);
    }
}
check();
