import { ethers, network } from 'hardhat';

async function main() {
  console.log(`Deploying DocumentIntegrityRegistry to ${network.name} network...`);

  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  const registryFactory = await ethers.getContractFactory('DocumentIntegrityRegistry');
  const registry = await registryFactory.deploy();

  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();

  console.log('DocumentIntegrityRegistry deployed successfully!');
  console.log('Contract Address:', contractAddress);

  return { registry, contractAddress };
}

main().catch((error) => {
  console.error('Deployment error:', error);
  process.exitCode = 1;
});
