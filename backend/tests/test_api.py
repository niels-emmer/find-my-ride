from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

TEST_ROOT = Path(tempfile.mkdtemp(prefix="fmr-tests-"))
TEST_DB = TEST_ROOT / "test.db"
TEST_UPLOADS = TEST_ROOT / "uploads"

os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{TEST_DB}"
os.environ["SECRET_KEY"] = "test-secret-key-please-replace-for-production-1234567890"
os.environ["CORS_ORIGINS"] = "http://testserver"
os.environ["UPLOAD_DIR"] = str(TEST_UPLOADS)
os.environ["MAX_PHOTOS_PER_RECORD"] = "3"
os.environ["MAX_PHOTO_SIZE_MB"] = "8"
os.environ["MFA_ISSUER"] = "find-my-ride-test"

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import pyotp
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import Base, engine
from app.main import app
from app.services.geocoding import format_location_label_from_payload, is_coordinate_label


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class FindMyRideApiTests(unittest.TestCase):
    def setUp(self) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        if TEST_UPLOADS.exists():
            shutil.rmtree(TEST_UPLOADS)
        TEST_UPLOADS.mkdir(parents=True, exist_ok=True)

        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)

    def bootstrap_admin(self, username: str = "admin", password: str = "SecurePass123") -> dict[str, Any]:
        response = self.client.post(
            "/api/auth/bootstrap",
            json={"username": username, "password": password},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_user(
        self,
        admin_token: str,
        username: str,
        password: str,
        is_admin: bool = False,
    ) -> dict[str, Any]:
        response = self.client.post(
            "/api/users",
            headers=auth_header(admin_token),
            json={"username": username, "password": password, "is_admin": is_admin},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def login(self, username: str, password: str, otp_code: str | None = None) -> dict[str, Any]:
        response = self.client.post(
            "/api/auth/login",
            json={
                "username": username,
                "password": password,
                "otp_code": otp_code,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create_record(
        self,
        token: str,
        note: str = "B2 near yellow elevator",
        location_label: str = "Garage Centrum, Amsterdam",
    ) -> dict[str, Any]:
        now = datetime.now(UTC).isoformat()
        response = self.client.post(
            "/api/parking/records",
            headers=auth_header(token),
            data={
                "latitude": "52.3702",
                "longitude": "4.8952",
                "location_label": location_label,
                "note": note,
                "parked_at": now,
            },
            files=[("photos", ("marker.jpg", b"fake-jpeg-binary", "image/jpeg"))],
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_record_persists_location_label_when_coordinates_are_saved(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]

        created = self.create_record(token, location_label="P4 Sky Bridge Entrance")
        self.assertEqual(created["location_label"], "P4 Sky Bridge Entrance")

        listed = self.client.get("/api/parking/records", headers=auth_header(token))
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json()[0]["location_label"], "P4 Sky Bridge Entrance")

    def test_record_creation_requires_location_or_evidence(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]

        missing_all = self.client.post(
            "/api/parking/records",
            headers=auth_header(token),
            data={"parked_at": datetime.now(UTC).isoformat()},
        )
        self.assertEqual(missing_all.status_code, 422, missing_all.text)
        self.assertEqual(missing_all.json()["detail"], "Provide a location, note, or photo")

        note_only = self.client.post(
            "/api/parking/records",
            headers=auth_header(token),
            data={
                "note": "B3 near west elevator",
                "parked_at": datetime.now(UTC).isoformat(),
            },
        )
        self.assertEqual(note_only.status_code, 201, note_only.text)
        payload = note_only.json()
        self.assertIsNone(payload["latitude"])
        self.assertIsNone(payload["longitude"])
        self.assertIsNone(payload["location_label"])
        self.assertEqual(payload["note"], "B3 near west elevator")

        photo_only = self.client.post(
            "/api/parking/records",
            headers=auth_header(token),
            data={"parked_at": datetime.now(UTC).isoformat()},
            files=[("photos", ("context.jpg", b"img-bytes", "image/jpeg"))],
        )
        self.assertEqual(photo_only.status_code, 201, photo_only.text)
        photo_payload = photo_only.json()
        self.assertIsNone(photo_payload["latitude"])
        self.assertIsNone(photo_payload["longitude"])
        self.assertIsNone(photo_payload["location_label"])
        self.assertEqual(len(photo_payload["photos"]), 1)

    def test_record_creation_rejects_partial_location(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]

        only_lat = self.client.post(
            "/api/parking/records",
            headers=auth_header(token),
            data={
                "latitude": "52.3702",
                "note": "partial location",
                "parked_at": datetime.now(UTC).isoformat(),
            },
        )
        self.assertEqual(only_lat.status_code, 422, only_lat.text)
        self.assertEqual(only_lat.json()["detail"], "Provide both latitude and longitude or neither")

    def test_record_creation_rejects_coordinate_style_location_label(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]

        response = self.client.post(
            "/api/parking/records",
            headers=auth_header(token),
            data={
                "latitude": "52.3702",
                "longitude": "4.8952",
                "location_label": "52.370200, 4.895200",
                "parked_at": datetime.now(UTC).isoformat(),
            },
        )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()["detail"], "Provide a physical address when storing coordinates")

    def test_record_rejects_control_characters_in_text_fields(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]

        create_bad_note = self.client.post(
            "/api/parking/records",
            headers=auth_header(token),
            data={
                "note": "B2 near elevator\x07",
                "parked_at": datetime.now(UTC).isoformat(),
            },
        )
        self.assertEqual(create_bad_note.status_code, 422, create_bad_note.text)
        self.assertIn("invalid control characters", create_bad_note.json()["detail"].lower())

        created = self.create_record(token)
        record_id = created["id"]
        update_bad_note = self.client.patch(
            f"/api/parking/records/{record_id}",
            headers=auth_header(token),
            json={"note": "tamper\x08note"},
        )
        self.assertEqual(update_bad_note.status_code, 422, update_bad_note.text)

    def test_record_update_requires_complete_location_pair_and_allows_clear(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]
        record_id = self.create_record(token)["id"]

        partial_update = self.client.patch(
            f"/api/parking/records/{record_id}",
            headers=auth_header(token),
            json={"latitude": 48.0},
        )
        self.assertEqual(partial_update.status_code, 422, partial_update.text)
        self.assertEqual(
            partial_update.json()["detail"],
            "Provide both latitude and longitude when updating location",
        )

        update_missing_label = self.client.patch(
            f"/api/parking/records/{record_id}",
            headers=auth_header(token),
            json={"latitude": 48.0, "longitude": 2.0},
        )
        self.assertEqual(update_missing_label.status_code, 422, update_missing_label.text)
        self.assertEqual(
            update_missing_label.json()["detail"],
            "Provide a physical address when updating location",
        )

        clear_location = self.client.patch(
            f"/api/parking/records/{record_id}",
            headers=auth_header(token),
            json={"latitude": None, "longitude": None},
        )
        self.assertEqual(clear_location.status_code, 200, clear_location.text)
        payload = clear_location.json()
        self.assertIsNone(payload["latitude"])
        self.assertIsNone(payload["longitude"])
        self.assertIsNone(payload["location_label"])

    def test_system_status_and_bootstrap_lifecycle(self) -> None:
        initial = self.client.get("/api/system/status")
        self.assertEqual(initial.status_code, 200, initial.text)
        self.assertFalse(initial.json()["has_users"])
        self.assertTrue(initial.json()["allow_self_register"])

        auth = self.bootstrap_admin()
        self.assertTrue(auth["user"]["is_admin"])

        after = self.client.get("/api/system/status")
        self.assertEqual(after.status_code, 200, after.text)
        self.assertTrue(after.json()["has_users"])
        self.assertTrue(after.json()["allow_self_register"])

    def test_refresh_token_rotation_and_logout(self) -> None:
        cookie_name = settings.refresh_token_cookie_name
        bootstrap = self.client.post(
            "/api/auth/bootstrap",
            json={"username": "refreshadmin", "password": "SecurePass123"},
        )
        self.assertEqual(bootstrap.status_code, 200, bootstrap.text)
        initial_refresh_cookie = bootstrap.cookies.get(cookie_name)
        self.assertIsNotNone(initial_refresh_cookie)

        refresh = self.client.post("/api/auth/refresh")
        self.assertEqual(refresh.status_code, 200, refresh.text)
        rotated_refresh_cookie = refresh.cookies.get(cookie_name)
        self.assertIsNotNone(rotated_refresh_cookie)
        self.assertNotEqual(initial_refresh_cookie, rotated_refresh_cookie)

        me = self.client.get("/api/auth/me", headers=auth_header(refresh.json()["access_token"]))
        self.assertEqual(me.status_code, 200, me.text)

        replay_old = self.client.post("/api/auth/refresh", cookies={cookie_name: initial_refresh_cookie})
        self.assertEqual(replay_old.status_code, 401, replay_old.text)

        self.client.cookies.set(cookie_name, rotated_refresh_cookie)
        logout = self.client.post("/api/auth/logout")
        self.assertEqual(logout.status_code, 200, logout.text)
        self.assertEqual(logout.json()["message"], "Signed out")

        refresh_after_logout = self.client.post("/api/auth/refresh")
        self.assertEqual(refresh_after_logout.status_code, 401, refresh_after_logout.text)

    def test_coordinate_label_detection(self) -> None:
        self.assertTrue(is_coordinate_label("52.370200, 4.895200"))
        self.assertTrue(is_coordinate_label("  -33.8710 , 151.2060 "))
        self.assertFalse(is_coordinate_label("P4 Sky Bridge Entrance"))

    def test_location_label_formatting_uses_street_first_order(self) -> None:
        payload = {
            "address": {
                "road": "Damrak",
                "house_number": "12",
                "postcode": "1012 LG",
                "city": "Amsterdam",
                "state": "Noord-Holland",
                "country": "Netherlands",
            }
        }
        label = format_location_label_from_payload(payload)
        self.assertEqual(label, "Damrak 12, 1012 LG Amsterdam, Noord-Holland, Netherlands")

    def test_bootstrap_only_runs_once(self) -> None:
        self.bootstrap_admin()
        second = self.client.post(
            "/api/auth/bootstrap",
            json={"username": "admin2", "password": "AnotherPass123"},
        )
        self.assertEqual(second.status_code, 400)

    def test_self_register_is_open(self) -> None:
        allowed = self.client.post(
            "/api/auth/register",
            json={"username": "selfuser", "password": "SelfRegister123"},
        )
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertFalse(allowed.json()["user"]["is_admin"])

    def test_password_policy_is_enforced(self) -> None:
        weak_bootstrap = self.client.post(
            "/api/auth/bootstrap",
            json={"username": "admin", "password": "lowercase1"},
        )
        self.assertEqual(weak_bootstrap.status_code, 422, weak_bootstrap.text)

        admin = self.bootstrap_admin("admin", "SecurePass123")
        token = admin["access_token"]

        weak_register = self.client.post(
            "/api/auth/register",
            json={"username": "weakuser", "password": "NoDigitsHere"},
        )
        self.assertEqual(weak_register.status_code, 422, weak_register.text)

        weak_user_create = self.client.post(
            "/api/users",
            headers=auth_header(token),
            json={"username": "weakuser2", "password": "lowercase1", "is_admin": False},
        )
        self.assertEqual(weak_user_create.status_code, 422, weak_user_create.text)

        weak_change = self.client.post(
            "/api/auth/change-password",
            headers=auth_header(token),
            json={"current_password": "SecurePass123", "new_password": "alllower1"},
        )
        self.assertEqual(weak_change.status_code, 422, weak_change.text)

    def test_username_validation_and_normalization(self) -> None:
        bootstrap = self.client.post(
            "/api/auth/bootstrap",
            json={"username": "  Admin.User  ", "password": "SecurePass123"},
        )
        self.assertEqual(bootstrap.status_code, 200, bootstrap.text)
        self.assertEqual(bootstrap.json()["user"]["username"], "admin.user")

        login = self.client.post(
            "/api/auth/login",
            json={"username": "ADMIN.USER", "password": "SecurePass123"},
        )
        self.assertEqual(login.status_code, 200, login.text)
        token = login.json()["access_token"]

        invalid_register = self.client.post(
            "/api/auth/register",
            json={"username": "bad name", "password": "ValidPass123"},
        )
        self.assertEqual(invalid_register.status_code, 422, invalid_register.text)

        invalid_create = self.client.post(
            "/api/users",
            headers=auth_header(token),
            json={"username": "../../root", "password": "ValidPass123", "is_admin": False},
        )
        self.assertEqual(invalid_create.status_code, 422, invalid_create.text)

    def test_login_requires_otp_when_mfa_enabled(self) -> None:
        admin = self.bootstrap_admin("secureadmin", "SecurePass123")
        token = admin["access_token"]

        setup = self.client.post("/api/auth/mfa/setup", headers=auth_header(token))
        self.assertEqual(setup.status_code, 200, setup.text)
        secret = setup.json()["secret"]

        verify_code = pyotp.TOTP(secret).now()
        verify = self.client.post(
            "/api/auth/mfa/verify",
            headers=auth_header(token),
            json={"code": verify_code},
        )
        self.assertEqual(verify.status_code, 200, verify.text)
        self.assertTrue(verify.json()["mfa_enabled"])

        missing_otp_login = self.client.post(
            "/api/auth/login",
            json={"username": "secureadmin", "password": "SecurePass123"},
        )
        self.assertEqual(missing_otp_login.status_code, 401)

        otp_login = self.client.post(
            "/api/auth/login",
            json={
                "username": "secureadmin",
                "password": "SecurePass123",
                "otp_code": pyotp.TOTP(secret).now(),
            },
        )
        self.assertEqual(otp_login.status_code, 200, otp_login.text)

    def test_admin_can_manage_users_and_non_admin_cannot(self) -> None:
        admin = self.bootstrap_admin()
        admin_token = admin["access_token"]

        self.create_user(admin_token, "jane", "JaneSecure123")

        non_admin_login = self.login("jane", "JaneSecure123")
        non_admin_token = non_admin_login["access_token"]

        forbidden = self.client.get("/api/users", headers=auth_header(non_admin_token))
        self.assertEqual(forbidden.status_code, 403)

        user_list = self.client.get("/api/users", headers=auth_header(admin_token))
        self.assertEqual(user_list.status_code, 200, user_list.text)
        self.assertGreaterEqual(len(user_list.json()), 2)

    def test_admin_can_edit_and_delete_users_but_not_self(self) -> None:
        admin = self.bootstrap_admin()
        admin_token = admin["access_token"]
        admin_id = admin["user"]["id"]
        cookie_name = settings.refresh_token_cookie_name

        jane = self.create_user(admin_token, "jane", "JaneSecure123")
        jane_id = jane["id"]

        edited = self.client.patch(
            f"/api/users/{jane_id}",
            headers=auth_header(admin_token),
            json={"password": "JaneReset123", "is_admin": True},
        )
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertTrue(edited.json()["is_admin"])

        old_login = self.client.post(
            "/api/auth/login",
            json={"username": "jane", "password": "JaneSecure123"},
        )
        self.assertEqual(old_login.status_code, 401, old_login.text)

        new_login = self.client.post(
            "/api/auth/login",
            json={"username": "jane", "password": "JaneReset123"},
        )
        self.assertEqual(new_login.status_code, 200, new_login.text)
        self.assertTrue(new_login.json()["user"]["is_admin"])
        self.assertIsNotNone(new_login.cookies.get(cookie_name))

        refresh_after_admin_reset = self.client.post("/api/auth/refresh")
        self.assertEqual(refresh_after_admin_reset.status_code, 200, refresh_after_admin_reset.text)

        reset_again = self.client.patch(
            f"/api/users/{jane_id}",
            headers=auth_header(admin_token),
            json={"password": "JaneFinal123"},
        )
        self.assertEqual(reset_again.status_code, 200, reset_again.text)

        refresh_after_second_reset = self.client.post("/api/auth/refresh")
        self.assertEqual(refresh_after_second_reset.status_code, 401, refresh_after_second_reset.text)

        edit_self = self.client.patch(
            f"/api/users/{admin_id}",
            headers=auth_header(admin_token),
            json={"is_admin": False},
        )
        self.assertEqual(edit_self.status_code, 400, edit_self.text)

        delete_self = self.client.delete(f"/api/users/{admin_id}", headers=auth_header(admin_token))
        self.assertEqual(delete_self.status_code, 400, delete_self.text)

        deleted = self.client.delete(f"/api/users/{jane_id}", headers=auth_header(admin_token))
        self.assertEqual(deleted.status_code, 204, deleted.text)

        deleted_login = self.client.post(
            "/api/auth/login",
            json={"username": "jane", "password": "JaneReset123"},
        )
        self.assertEqual(deleted_login.status_code, 401, deleted_login.text)

    def test_change_password_requires_current_password_and_enables_new_login(self) -> None:
        admin = self.bootstrap_admin("changepass", "SecurePass123")
        token = admin["access_token"]

        wrong_current = self.client.post(
            "/api/auth/change-password",
            headers=auth_header(token),
            json={
                "current_password": "WrongPass123",
                "new_password": "ANewSecure123",
            },
        )
        self.assertEqual(wrong_current.status_code, 400, wrong_current.text)

        changed = self.client.post(
            "/api/auth/change-password",
            headers=auth_header(token),
            json={
                "current_password": "SecurePass123",
                "new_password": "ANewSecure123",
            },
        )
        self.assertEqual(changed.status_code, 200, changed.text)

        refresh_after_change = self.client.post("/api/auth/refresh")
        self.assertEqual(refresh_after_change.status_code, 401, refresh_after_change.text)

        old_login = self.client.post(
            "/api/auth/login",
            json={"username": "changepass", "password": "SecurePass123"},
        )
        self.assertEqual(old_login.status_code, 401, old_login.text)

        new_login = self.client.post(
            "/api/auth/login",
            json={"username": "changepass", "password": "ANewSecure123"},
        )
        self.assertEqual(new_login.status_code, 200, new_login.text)

    def test_owner_parking_record_crud_and_latest(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]

        created = self.create_record(token, note="P3 section C")
        record_id = created["id"]
        self.assertEqual(len(created["photos"]), 1)

        listed = self.client.get("/api/parking/records", headers=auth_header(token))
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 1)

        latest = self.client.get("/api/parking/records/latest", headers=auth_header(token))
        self.assertEqual(latest.status_code, 200, latest.text)
        self.assertEqual(latest.json()["id"], record_id)

        updated = self.client.patch(
            f"/api/parking/records/{record_id}",
            headers=auth_header(token),
            json={
                "note": "P3 section D",
                "latitude": 52.371,
                "longitude": 4.896,
                "location_label": "P3 section D, Amsterdam",
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["note"], "P3 section D")

        deleted = self.client.delete(f"/api/parking/records/{record_id}", headers=auth_header(token))
        self.assertEqual(deleted.status_code, 204, deleted.text)

        empty_latest = self.client.get("/api/parking/records/latest", headers=auth_header(token))
        self.assertEqual(empty_latest.status_code, 200, empty_latest.text)
        self.assertIsNone(empty_latest.json())

    def test_record_acl_blocks_non_owner_access(self) -> None:
        admin = self.bootstrap_admin()
        admin_token = admin["access_token"]

        self.create_user(admin_token, "alice", "AlicePass123")
        self.create_user(admin_token, "bob", "BobsPass123")

        alice_token = self.login("alice", "AlicePass123")["access_token"]
        bob_token = self.login("bob", "BobsPass123")["access_token"]

        alice_record = self.create_record(alice_token, note="L2 purple stairs")
        record_id = alice_record["id"]

        bob_list = self.client.get("/api/parking/records", headers=auth_header(bob_token))
        self.assertEqual(bob_list.status_code, 200, bob_list.text)
        self.assertEqual(len(bob_list.json()), 0)

        bob_patch = self.client.patch(
            f"/api/parking/records/{record_id}",
            headers=auth_header(bob_token),
            json={"note": "tamper attempt"},
        )
        self.assertEqual(bob_patch.status_code, 403)

        bob_delete = self.client.delete(f"/api/parking/records/{record_id}", headers=auth_header(bob_token))
        self.assertEqual(bob_delete.status_code, 403)

        admin_all = self.client.get("/api/parking/records", headers=auth_header(admin_token))
        self.assertEqual(admin_all.status_code, 200, admin_all.text)
        self.assertEqual(len(admin_all.json()), 1)

    def test_photo_lifecycle_limit_download_and_delete(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]

        created = self.create_record(token)
        record_id = created["id"]

        add_two = self.client.post(
            f"/api/parking/records/{record_id}/photos",
            headers=auth_header(token),
            files=[
                ("photos", ("one.jpg", b"img-1", "image/jpeg")),
                ("photos", ("two.jpg", b"img-2", "image/jpeg")),
            ],
        )
        self.assertEqual(add_two.status_code, 200, add_two.text)
        self.assertEqual(len(add_two.json()["photos"]), 3)

        over_limit = self.client.post(
            f"/api/parking/records/{record_id}/photos",
            headers=auth_header(token),
            files=[("photos", ("three.jpg", b"img-3", "image/jpeg"))],
        )
        self.assertEqual(over_limit.status_code, 422)

        first_photo_id = add_two.json()["photos"][0]["id"]
        download = self.client.get(
            f"/api/parking/photos/{first_photo_id}/download",
            headers=auth_header(token),
        )
        self.assertEqual(download.status_code, 200, download.text)
        self.assertGreater(len(download.content), 0)

        remove = self.client.delete(
            f"/api/parking/photos/{first_photo_id}",
            headers=auth_header(token),
        )
        self.assertEqual(remove.status_code, 204, remove.text)

    def test_record_accepts_mobile_image_mime_variants(self) -> None:
        admin = self.bootstrap_admin()
        token = admin["access_token"]

        response = self.client.post(
            "/api/parking/records",
            headers=auth_header(token),
            data={
                "latitude": "52.3702",
                "longitude": "4.8952",
                "location_label": "Mobile MIME Garage Entrance",
                "note": "MIME coverage check",
                "parked_at": datetime.now(UTC).isoformat(),
            },
            files=[("photos", ("mobile.heic", b"fake-heic", "image/heic-sequence"))],
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(response.json()["photos"]), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
