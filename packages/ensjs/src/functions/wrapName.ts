import { BigNumber, ethers } from 'ethers'
import { ENSArgs } from '..'
import { FuseOptions } from '../utils/fuses'
import generateFuseInput from '../utils/generateFuseInput'
import { hexEncodeName } from '../utils/hexEncodedName'
import { Expiry, makeExpiry, wrappedLabelLengthCheck } from '../utils/wrapper'

async function wrapETH(
  { contracts }: ENSArgs<'contracts'>,
  labels: string[],
  wrappedOwner: string,
  expiry: BigNumber,
  decodedFuses: string,
  resolverAddress: string,
  signer: ethers.Signer,
  address: string,
) {
  const nameWrapper = await contracts?.getNameWrapper()!
  const baseRegistrar = (await contracts!.getBaseRegistrar()!).connect(signer)

  const labelhash = ethers.utils.solidityKeccak256(['string'], [labels[0]])

  const data = ethers.utils.defaultAbiCoder.encode(
    ['string', 'address', 'uint32', 'uint64', 'address'],
    [labels[0], wrappedOwner, decodedFuses, expiry, resolverAddress],
  )

  return baseRegistrar.populateTransaction[
    'safeTransferFrom(address,address,uint256,bytes)'
  ](address, nameWrapper.address, labelhash, data)
}

async function wrapOther(
  { contracts }: ENSArgs<'contracts'>,
  name: string,
  wrappedOwner: string,
  resolverAddress: string,
  address: string,
  signer: ethers.Signer,
) {
  const nameWrapper = (await contracts!.getNameWrapper()!).connect(signer)
  const registry = await contracts?.getRegistry()!

  const hasApproval = await registry.isApprovedForAll(
    address,
    nameWrapper.address,
  )

  if (!hasApproval) {
    throw new Error(
      'NameWrapper must have approval to wrap a name from this address.',
    )
  }

  return nameWrapper.populateTransaction.wrap(
    hexEncodeName(name),
    wrappedOwner,
    resolverAddress,
  )
}

export default async function (
  {
    contracts,
    signer,
    getExpiry,
  }: ENSArgs<'contracts' | 'signer' | 'getExpiry'>,
  name: string,
  {
    wrappedOwner,
    fuseOptions,
    expiry,
    resolverAddress,
  }: {
    wrappedOwner: string
    fuseOptions?: FuseOptions | string | number
    expiry?: Expiry
    resolverAddress?: string
  },
) {
  const address = await signer.getAddress()

  let decodedFuses: string

  const publicResolver = await contracts?.getPublicResolver()!
  if (!resolverAddress) resolverAddress = publicResolver.address

  const labels = name.split('.')
  wrappedLabelLengthCheck(labels[0])

  if (labels.length === 2 && labels[1] === 'eth') {
    switch (typeof fuseOptions) {
      case 'object': {
        decodedFuses = generateFuseInput(fuseOptions)
        break
      }
      case 'number': {
        decodedFuses = fuseOptions.toString(16)
        break
      }
      case 'string': {
        decodedFuses = fuseOptions
        break
      }
      case 'undefined': {
        decodedFuses = '0'
        break
      }
      default: {
        throw new Error(`Invalid fuseOptions type: ${typeof fuseOptions}`)
      }
    }

    const expiryToUse = await makeExpiry({ getExpiry }, name, expiry)

    return wrapETH(
      { contracts },
      labels,
      wrappedOwner,
      expiryToUse,
      decodedFuses,
      resolverAddress,
      signer,
      address,
    )
  }
  if (fuseOptions)
    throw new Error(
      'Fuses can not be initially set when wrapping a non .eth name',
    )
  if (expiry)
    throw new Error(
      'Expiry can not be initially set when wrapping a non .eth name',
    )
  return wrapOther(
    { contracts },
    name,
    wrappedOwner,
    resolverAddress,
    address,
    signer,
  )
}
