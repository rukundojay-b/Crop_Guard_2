import bcrypt from 'bcryptjs'

const ROUNDS = 12

export const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS)

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash)

// A throwaway hash compared against when the email does not exist, so that a
// wrong email and a wrong password take the same amount of time to answer.
const DUMMY_HASH = bcrypt.hashSync('cropguard-timing-equaliser', ROUNDS)
export const burnPasswordTime = () => bcrypt.compare('x', DUMMY_HASH)
