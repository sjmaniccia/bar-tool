// ===== NewPlace.tsx =====
// "Start a new place" from the profile menu: anyone can, staff included.
// The new place is theirs (owner); the places they already belong to stay in "Your places".

import { useNavigate } from "react-router";
import { PlaceSetupForm } from "./AuthScreens";

export default function NewPlace() {
    const navigate = useNavigate();
    return (
        <div className="page page-narrow">
            <div className="page-header">
                <div>
                    <h1>Start a new place</h1>
                    <p className="muted">It's yours, separate from the places you're already in. Switch between them from your profile menu.</p>
                </div>
            </div>
            <section className="card">
                <PlaceSetupForm onCancel={() => navigate(-1)} onDone={() => navigate("/", { replace: true })} />
            </section>
        </div>
    );
}
