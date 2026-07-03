import React, { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../context/user.context'
import axios from '../config/axios'

const UserAuth = ({ children }) => {

    const { user, setUser } = useContext(UserContext)
    const [ loading, setLoading ] = useState(true)
    const token = localStorage.getItem('token')
    const navigate = useNavigate()

    useEffect(() => {
        if (!token) {
            navigate('/login')
            return
        }

        if (user) {
            setLoading(false)
            return
        }

        // Token exists but user context is empty (page reload) — fetch profile
        axios.get('/users/profile')
            .then((res) => {
                setUser(res.data.user)
                setLoading(false)
            })
            .catch(() => {
                localStorage.removeItem('token')
                navigate('/login')
            })

    }, [])

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white text-xl">Loading...</div>
    }

    return (
        <>{children}</>
    )
}

export default UserAuth