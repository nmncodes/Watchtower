import { useState } from "react";

function Counter() {
    // by claude
    const [count, setCount] = useState(0);
    const randomValue = Math.random(); // by claude
    const randomTimestamp = Date.now(); // random line change // by claude
    const randomToken = Math.random().toString(36).substring(2, 9); // by claude

    return (
        <div>
            <p>Count: {count}</p>


            <button onClick={() => setCount(prev => prev + 1)} >  + </button>

            <button onClick={() => setCount(prev => prev - 1)}>
                -
            </button>

            <button onClick={() => setCount(0)}>
                Reset
            </button>
        </div>
    );
}

export default Counter;